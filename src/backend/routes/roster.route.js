const express = require("express");
const mongoose = require("mongoose");
const {
	getRosterModelForYear,
	getDriverModelForYear,
	getUserModelForYear,
	getRaceModelForYear,
	validateYear,
} = require("../models/modelPerYear");
const {
	calculateDriversBudget,
	validateUserBudget,
	validateDriverCategories,
	validateRosterData,
	updateUserBudget,
	restoreUserBudget,
	handleBudgetUpdate,
} = require("../middleware/rosterValidation");
const {
	createRosterValidation,
	updateRosterValidation,
	mongoIdValidation,
	yearValidation,
} = require("../middleware/validation");
const { checkRole } = require("../middleware/rbac");
const { AppError, catchAsync } = require("../middleware/errorHandler");
const { authenticateToken, checkElevated } = require("../middleware/auth");

const router = express.Router();

function isValidObjectId(id) {
	return mongoose.Types.ObjectId.isValid(id);
}

router.get(
	"/:year",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Roster = getRosterModelForYear(year);

		const { user, race, sort = "createdAt", order = "desc" } = req.query;

		const query = {};
		if (user && isValidObjectId(user)) {
			query.user = user;
		}
		if (race && isValidObjectId(race)) {
			query.race = race;
		}

		const sortOrder = order === "desc" ? -1 : 1;
		const validSortFields = [
			"createdAt",
			"budgetUsed",
			"pointsEarned",
			"updatedAt",
		];
		const sortField = validSortFields.includes(sort) ? sort : "createdAt";
		const sortOptions = { [sortField]: sortOrder };

		const rosters = await Roster.find(query)
			.populate("user", "username role")
			.populate("drivers", "name value categories")
			.populate("race", "name roundNumber location")
			.sort(sortOptions)
			.lean();

		res.status(200).json({
			success: true,
			year: parseInt(year),
			count: rosters.length,
			rosters,
		});
	})
);

router.get(
	"/:year/:id",
	authenticateToken,
	yearValidation,
	mongoIdValidation("id"),
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const Roster = getRosterModelForYear(year);

		const roster = await Roster.findById(id)
			.populate("user", "username role points budget")
			.populate("drivers", "name value categories points")
			.populate(
				"race",
				"name roundNumber location submissionDeadline isLocked"
			)
			.lean();

		if (!roster) {
			throw new AppError("Roster not found", 404);
		}

		res.status(200).json({
			success: true,
			year: parseInt(year),
			roster,
		});
	})
);

router.post(
	"/:year",
	authenticateToken,
	yearValidation,
	createRosterValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const {
			user: userId,
			drivers: driverIds,
			budgetUsed,
			pointsEarned = 0,
			race: raceId,
		} = req.body;

		if (!userId || !isValidObjectId(userId)) {
			throw new AppError("Valid user ID is required", 400);
		}
		if (!raceId || !isValidObjectId(raceId)) {
			throw new AppError("Valid race ID is required", 400);
		}
		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			throw new AppError("At least one driver must be selected", 400);
		}
		if (!driverIds.every((id) => isValidObjectId(id))) {
			throw new AppError("All driver IDs must be valid", 400);
		}

		const Roster = getRosterModelForYear(year);
		const User = getUserModelForYear(year);
		const Race = getRaceModelForYear(year);

		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			const user = await User.findById(userId).lean();
			if (!user) {
				throw new AppError("User not found for this year", 404);
			}

			const race = await Race.findById(raceId).lean();
			if (!race) {
				throw new AppError("Race not found for this year", 404);
			}

			if (race.isLocked) {
				throw new AppError("Cannot create roster for locked race", 400);
			}

			if (new Date() > new Date(race.submissionDeadline)) {
				throw new AppError("Submission deadline has passed", 400);
			}

			const existingRoster = await Roster.findOne({
				user: userId,
				race: raceId,
			}).lean();

			if (existingRoster) {
				throw new AppError(
					"User already has a roster for this race",
					409
				);
			}

			const validationRoster = await validateRosterData(
				{
					user: userId,
					drivers: driverIds,
					budgetUsed: budgetUsed || 0,
				},
				year
			);

			const validateBudget = await validateUserBudget(
				{
					user: userId,
					drivers: driverIds,
				},
				year
			);

			if (!validationRoster.isValid || !validateBudget.isValid) {
				const allErrors = [
					...validationRoster.errors,
					...(validateBudget.isValid
						? []
						: [
								`Budget exceeded by £${validateBudget.exceedsBy.toFixed(
									2
								)}`,
						  ]),
				];
				throw new AppError(
					`Roster or budget validation failed: ${allErrors.join(
						", "
					)}`,
					400
				);
			}

			const budgetUpdate = await updateUserBudget(
				userId,
				driverIds,
				year,
				session
			);

			const newRoster = new Roster({
				user: userId,
				drivers: driverIds,
				budgetUsed: validationRoster.calculatedBudget,
				pointsEarned,
				race: raceId,
			});

			await newRoster.save({ session });

			await session.commitTransaction();

			const populatedRoster = await Roster.findById(newRoster._id)
				.populate("user", "username role budget")
				.populate("drivers", "name value categories")
				.populate("race", "name roundNumber location")
				.lean();

			res.status(201).json({
				success: true,
				message: "Roster created successfully",
				year: parseInt(year),
				roster: populatedRoster,
				budgetInfo: {
					calculatedBudget: validationRoster.calculatedBudget,
					deductedAmount: budgetUpdate.deductedAmount,
					remainingBudget: budgetUpdate.remainingBudget,
				},
			});
		} catch (error) {
			await session.abortTransaction();
			throw error;
		} finally {
			session.endSession();
		}
	})
);

router.put(
	"/:year/:rosterId",
	authenticateToken,
	yearValidation,
	mongoIdValidation("rosterId"),
	updateRosterValidation,
	catchAsync(async (req, res) => {
		const { year, rosterId } = req.params;
		const updates = req.body;

		if (!isValidObjectId(rosterId)) {
			throw new AppError("Invalid roster ID", 400);
		}

		const Roster = getRosterModelForYear(year);

		const allowedUpdates = ["drivers", "budgetUsed", "pointsEarned"];
		const actualUpdates = Object.keys(updates).filter((key) =>
			allowedUpdates.includes(key)
		);

		if (actualUpdates.length === 0) {
			throw new AppError("No valid fields provided for update", 400);
		}

		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			const roster = await Roster.findById(rosterId)
				.populate("race")
				.populate("user", "_id username role")
				.session(session);

			if (!roster) {
				throw new AppError("Roster not found", 404);
			}

			const currentUserId = req.user._id || req.user.id;
			const rosterUserId = roster.user._id || roster.user.id;

			if (
				rosterUserId.toString() !== currentUserId.toString() &&
				req.user.role !== "admin"
			) {
				throw new AppError("You can only update your own rosters", 403);
			}

			if (req.user.role !== "admin") {
				if (roster.race.isLocked) {
					throw new AppError(
						"Cannot update roster for locked race",
						403
					);
				}

				if (new Date() > new Date(roster.race.submissionDeadline)) {
					throw new AppError("Submission deadline has passed", 400);
				}
			}

			let budgetUpdateResult = null;

			if (updates.drivers) {
				if (
					!Array.isArray(updates.drivers) ||
					updates.drivers.length === 0
				) {
					throw new AppError(
						"At least one driver must be selected",
						400
					);
				}

				if (!updates.drivers.every((id) => isValidObjectId(id))) {
					throw new AppError("All driver IDs must be valid", 400);
				}

				const validation = await validateRosterData(
					{
						user: roster.user._id,
						drivers: updates.drivers,
						budgetUsed: updates.budgetUsed || roster.budgetUsed,
					},
					year
				);

				if (!validation.isValid) {
					throw new AppError(
						`Roster validation failed: ${validation.errors.join(
							", "
						)}`,
						400
					);
				}

				budgetUpdateResult = await handleBudgetUpdate(
					roster.user._id,
					roster.drivers,
					updates.drivers,
					year,
					session
				);

				updates.budgetUsed = validation.calculatedBudget;
			}

			const filteredUpdates = {};
			actualUpdates.forEach((key) => {
				filteredUpdates[key] = updates[key];
			});
			filteredUpdates.updatedAt = new Date();

			const updatedRoster = await Roster.findByIdAndUpdate(
				rosterId,
				{ $set: filteredUpdates },
				{ new: true, runValidators: true, session }
			)
				.populate("user", "username role budget")
				.populate("drivers", "name value categories points")
				.populate("race", "name roundNumber location");

			await session.commitTransaction();

			const response = {
				success: true,
				message: "Roster updated successfully",
				year: parseInt(year),
				roster: updatedRoster.toObject(),
			};

			if (budgetUpdateResult && budgetUpdateResult.budgetChange !== 0) {
				response.budgetInfo = {
					budgetChange: budgetUpdateResult.budgetChange,
					remainingBudget: budgetUpdateResult.remainingBudget,
					message: budgetUpdateResult.message,
				};
			}

			res.status(200).json(response);
		} catch (error) {
			await session.abortTransaction();
			throw error;
		} finally {
			session.endSession();
		}
	})
);

router.delete(
	"/:year/:id",
	authenticateToken,
	yearValidation,
	mongoIdValidation("id"),
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const Roster = getRosterModelForYear(year);

		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			const roster = await Roster.findById(id)
				.populate("race")
				.populate("user", "_id username role")
				.session(session);

			if (!roster) {
				throw new AppError("Roster not found", 404);
			}

			const currentUserId = req.user._id || req.user.id;
			const rosterUserId = roster.user._id || roster.user.id;

			if (
				rosterUserId.toString() !== currentUserId.toString() &&
				req.user.role !== "admin"
			) {
				throw new AppError("You can only delete your own rosters", 403);
			}

			if (req.user.role !== "admin" && roster.race.isLocked) {
				throw new AppError("Cannot delete roster for locked race", 403);
			}

			const budgetRestore = await restoreUserBudget(
				roster.user._id,
				roster.drivers,
				year,
				session
			);

			await Roster.findByIdAndDelete(id, { session });

			await session.commitTransaction();

			res.status(200).json({
				success: true,
				message: "Roster deleted successfully",
				year: parseInt(year),
				deletedRoster: {
					id: roster._id,
					user: roster.user._id,
					race: roster.race._id,
				},
				budgetInfo: {
					restoredAmount: budgetRestore.restoredAmount,
					remainingBudget: budgetRestore.remainingBudget,
				},
			});
		} catch (error) {
			await session.abortTransaction();
			throw error;
		} finally {
			session.endSession();
		}
	})
);

router.get(
	"/:year/stats",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Roster = getRosterModelForYear(year);

		const [
			totalRosters,
			avgBudgetUsed,
			avgPointsEarned,
			topPerformers,
			rostersByRace,
		] = await Promise.all([
			Roster.countDocuments(),
			Roster.aggregate([
				{ $group: { _id: null, avg: { $avg: "$budgetUsed" } } },
			]),
			Roster.aggregate([
				{ $group: { _id: null, avg: { $avg: "$pointsEarned" } } },
			]),
			Roster.find({})
				.populate("user", "username")
				.populate("race", "name roundNumber")
				.sort({ pointsEarned: -1 })
				.limit(10)
				.lean(),
			Roster.aggregate([
				{
					$group: {
						_id: "$race",
						count: { $sum: 1 },
						avgPoints: { $avg: "$pointsEarned" },
						avgBudget: { $avg: "$budgetUsed" },
					},
				},
				{
					$lookup: {
						from: `races_${year}`,
						localField: "_id",
						foreignField: "_id",
						as: "raceDetails",
					},
				},
				{ $unwind: "$raceDetails" },
				{ $sort: { "raceDetails.roundNumber": 1 } },
			]),
		]);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			stats: {
				rosters: {
					total: totalRosters,
					avgBudgetUsed:
						Math.round((avgBudgetUsed[0]?.avg || 0) * 100) / 100,
					avgPointsEarned:
						Math.round((avgPointsEarned[0]?.avg || 0) * 100) / 100,
				},
				topPerformers: topPerformers.map((roster) => ({
					user: roster.user.username,
					race: roster.race.name,
					points: roster.pointsEarned,
					budget: roster.budgetUsed,
				})),
				byRace: rostersByRace.map((item) => ({
					race: item.raceDetails.name,
					round: item.raceDetails.roundNumber,
					rosterCount: item.count,
					avgPoints: Math.round(item.avgPoints * 100) / 100,
					avgBudget: Math.round(item.avgBudget * 100) / 100,
				})),
			},
		});
	})
);

router.get(
	"/:year/user/:userId",
	authenticateToken,
	yearValidation,
	mongoIdValidation("userId"),
	catchAsync(async (req, res) => {
		const { year, userId } = req.params;
		const Roster = getRosterModelForYear(year);

		if (!isValidObjectId(userId)) {
			throw new AppError("Invalid user ID", 400);
		}

		const currentUserId = req.user._id || req.user.id;
		if (userId !== currentUserId.toString() && req.user.role !== "admin") {
			throw new AppError("You can only view your own rosters", 403);
		}

		const rosters = await Roster.find({ user: userId })
			.populate("drivers", "name value categories points")
			.populate(
				"race",
				"name roundNumber location submissionDeadline isLocked"
			)
			.sort({ createdAt: -1 })
			.lean();

		const totalPoints = rosters.reduce(
			(sum, roster) => sum + roster.pointsEarned,
			0
		);
		const totalBudgetUsed = rosters.reduce(
			(sum, roster) => sum + roster.budgetUsed,
			0
		);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			userId,
			count: rosters.length,
			summary: {
				totalPoints,
				totalBudgetUsed: Math.round(totalBudgetUsed * 100) / 100,
				avgPoints:
					rosters.length > 0
						? Math.round((totalPoints / rosters.length) * 100) / 100
						: 0,
			},
			rosters,
		});
	})
);

router.post(
	"/:year/validate",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const { user: userId, drivers: driverIds, budgetUsed } = req.body;

		if (!userId || !isValidObjectId(userId)) {
			throw new AppError("Valid user ID is required", 400);
		}
		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			throw new AppError("At least one driver must be selected", 400);
		}
		if (!driverIds.every((id) => isValidObjectId(id))) {
			throw new AppError("All driver IDs must be valid", 400);
		}

		try {
			const validation = await validateRosterData(
				{
					user: userId,
					drivers: driverIds,
					budgetUsed: budgetUsed || 0,
				},
				year
			);

			res.status(200).json({
				success: true,
				year: parseInt(year),
				validation: {
					isValid: validation.isValid,
					errors: validation.errors,
					budgetInfo: validation.budgetInfo,
					categoryInfo: validation.categoryInfo,
					calculatedBudget: validation.calculatedBudget,
					providedBudget: validation.providedBudget,
				},
			});
		} catch (error) {
			throw new AppError(`Validation failed: ${error.message}`, 400);
		}
	})
);

module.exports = router;
