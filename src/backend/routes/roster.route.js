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
} = require("../utils/calculateBudget");
const {
	createRosterValidation,
	updateRosterValidation,
	mongoIdValidation,
	yearValidation,
} = require("../middleware/validation");
const { checkRole } = require("../middleware/rbac");
const { AppError, catchAsync } = require("../middleware/errorHandler");
const { authenticateToken, checkElevated } = require("../middleware/auth");
const { body } = require("express-validator");

const router = express.Router();

router.get(
	"/:year",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Roster = getRosterModelForYear(year);

		const { user, race, sort = "createdAt", order = "desc" } = req.query;

		let query = {};
		if (user && mongoose.Types.ObjectId.isValid(user)) {
			query.user = user;
		}
		if (race && mongoose.Types.ObjectId.isValid(race)) {
			query.race = race;
		}

		const sortOrder = order === "desc" ? -1 : 1;
		const sortOptions = {};
		if (["createdAt", "budgetUsed", "pointsEarned"].includes(sort)) {
			sortOptions[sort] = sortOrder;
		} else {
			sortOptions.createdAt = -1;
		}

		const rosters = await Roster.find(query)
			.populate("user", "username role")
			.populate("drivers", "name value categories")
			.populate("race", "name roundNumber")
			.sort(sortOptions);

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
	mongoIdValidation(),
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const Roster = getRosterModelForYear(year);

		const roster = await Roster.findById(id)
			.populate("user", "username role points budget")
			.populate("drivers", "name value categories points")
			.populate(
				"race",
				"name roundNumber location submissionDeadline isLocked"
			);

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

		const Roster = getRosterModelForYear(year);
		const User = getUserModelForYear(year);
		const Race = getRaceModelForYear(year);

		const user = await User.findById(userId);
		if (!user) {
			throw new AppError("User not found for this year", 404);
		}

		const race = await Race.findById(raceId);
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
		});
		if (existingRoster) {
			throw new AppError("User already has a roster for this race", 409);
		}

		const validation = await validateRosterData(
			{
				user: userId,
				drivers: driverIds,
				budgetUsed: budgetUsed || 0,
			},
			year
		);

		if (!validation.isValid) {
			throw new AppError(
				`Roster validation failed: ${validation.errors.join(", ")}`,
				400
			);
		}

		const finalBudgetUsed = validation.calculatedBudget;

		const newRoster = new Roster({
			user: userId,
			drivers: driverIds,
			budgetUsed: finalBudgetUsed,
			pointsEarned,
			race: raceId,
		});

		await newRoster.save();

		await newRoster.populate([
			{ path: "user", select: "username role" },
			{ path: "drivers", select: "name value categories" },
			{ path: "race", select: "name roundNumber" },
		]);

		res.status(201).json({
			success: true,
			message: "Roster created successfully",
			year: parseInt(year),
			roster: newRoster,
			budgetInfo: {
				calculatedBudget: validation.calculatedBudget,
				userBudget: validation.budgetInfo.userBudget,
				remainingBudget: validation.budgetInfo.remainingBudget,
			},
		});
	})
);

router.put(
	"/:year/:userId/:rosterId",
	authenticateToken,
	yearValidation,
	mongoIdValidation(),
	updateRosterValidation,
	catchAsync(async (req, res) => {
		const { year, userId, rosterId } = req.params;
		const updates = req.body;

		const Roster = getRosterModelForYear(year);

		const allowedUpdates = ["drivers", "budgetUsed", "pointsEarned"];
		const actualUpdates = Object.keys(updates).filter((key) =>
			allowedUpdates.includes(key)
		);

		if (actualUpdates.length === 0) {
			throw new AppError("No valid fields provided for update", 400);
		}

		const roster = await Roster.findById(rosterId).populate("race");
		if (!roster) {
			throw new AppError("Roster not found", 404);
		}

		// Authorization check
		if (
			roster.user.toString() !== userId ||
			(req.user._id.toString() !== userId && req.user.role !== "admin")
		) {
			throw new AppError("You can only update your own rosters", 403);
		}

		if (roster.race.isLocked && req.user.role !== "admin") {
			throw new AppError("Cannot update roster for locked race", 403);
		}

		if (
			new Date() > new Date(roster.race.submissionDeadline) &&
			req.user.role !== "admin"
		) {
			throw new AppError("Submission deadline has passed", 400);
		}

		if (updates.drivers) {
			const validation = await validateRosterData(
				{
					user: roster.user,
					drivers: updates.drivers,
					budgetUsed: updates.budgetUsed || 0,
				},
				year
			);

			if (!validation.isValid) {
				throw new AppError(
					`Roster validation failed: ${validation.errors.join(", ")}`,
					400
				);
			}

			updates.budgetUsed = validation.calculatedBudget;
		}

		const filteredUpdates = {};
		actualUpdates.forEach((key) => {
			filteredUpdates[key] = updates[key];
		});

		const updatedRoster = await Roster.findByIdAndUpdate(
			userId,
			rosterId,
			{ $set: filteredUpdates },
			{ new: true, runValidators: true }
		).populate([
			{ path: "user", select: "username role" },
			{ path: "drivers", select: "name value categories points" },
			{ path: "race", select: "name roundNumber" },
		]);

		res.status(200).json({
			success: true,
			message: "Roster updated successfully",
			year: parseInt(year),
			roster: updatedRoster,
		});
	})
);

router.delete(
	"/:year/:id",
	authenticateToken,
	yearValidation,
	mongoIdValidation(),
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const Roster = getRosterModelForYear(year);

		const roster = await Roster.findById(id).populate("race");
		if (!roster) {
			throw new AppError("Roster not found", 404);
		}

		if (roster.race.isLocked && req.user.role !== "admin") {
			throw new AppError("Cannot delete roster for locked race", 403);
		}

		if (
			roster.user.toString() !== req.user._id.toString() &&
			req.user.role !== "admin"
		) {
			throw new AppError("You can only delete your own rosters", 403);
		}

		await Roster.findByIdAndDelete(id);

		res.status(200).json({
			success: true,
			message: "Roster deleted successfully",
			year: parseInt(year),
			deletedRoster: {
				id: roster._id,
				user: roster.user,
				race: roster.race._id,
			},
		});
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
				.limit(10),
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
					avgBudgetUsed: avgBudgetUsed[0]?.avg || 0,
					avgPointsEarned: avgPointsEarned[0]?.avg || 0,
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
					avgPoints: item.avgPoints,
					avgBudget: item.avgBudget,
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

		if (userId !== req.user._id.toString() && req.user.role !== "admin") {
			throw new AppError("You can only view your own rosters", 403);
		}

		const rosters = await Roster.find({ user: userId })
			.populate("drivers", "name value categories points")
			.populate(
				"race",
				"name roundNumber location submissionDeadline isLocked"
			)
			.sort({ createdAt: -1 });

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
				totalBudgetUsed,
				avgPoints:
					rosters.length > 0 ? totalPoints / rosters.length : 0,
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
