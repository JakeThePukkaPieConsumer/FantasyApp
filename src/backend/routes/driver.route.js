const express = require("express");
const mongoose = require("mongoose");
const {
	getDriverModelForYear,
	validateYear,
} = require("../models/modelPerYear");
const {
	createDriverValidation,
	updateDriverValidation,
	mongoIdValidation,
	handleValidationErrors,
	yearValidation,
} = require("../middleware/validation");
const { checkRole } = require("../middleware/rbac");
const { AppError, catchAsync } = require("../middleware/errorHandler");
const { body } = require("express-validator");
const { authenticateToken, checkElevated } = require("../middleware/auth");

const router = express.Router();

router.get(
	"/:year",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Driver = getDriverModelForYear(year);

		const { category, sort = "name", order = "asc" } = req.query;

		let query = {};
		if (category && ["M", "JS", "I"].includes(category)) {
			query.categories = category;
		}

		const sortOrder = order === "desc" ? -1 : 1;
		const sortOptions = {};
		if (["name", "value", "points"].includes(sort)) {
			sortOptions[sort] = sortOrder;
		} else {
			sortOptions.name = 1;
		}

		const drivers = await Driver.find(query)
			.select("-__v")
			.sort(sortOptions);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			count: drivers.length,
			drivers,
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
		const Driver = getDriverModelForYear(year);

		const driver = await Driver.findById(id).select("-__v");

		if (!driver) {
			throw new AppError("Driver not found", 404);
		}

		res.status(200).json({
			success: true,
			year: parseInt(year),
			driver,
		});
	})
);

router.post(
	"/:year",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	yearValidation,
	createDriverValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Driver = getDriverModelForYear(year);
		const { name, value = 0, categories, imageURL, description } = req.body;

		const trimmedName = name.trim();

		const existingDriver = await Driver.findOne({
			name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
		});

		if (existingDriver) {
			throw new AppError(
				"A driver with this name already exists for this year",
				409
			);
		}

		const newDriver = new Driver({
			name: trimmedName,
			value,
			categories,
			imageURL,
			description,
		});

		await newDriver.save();

		res.status(201).json({
			success: true,
			message: "Driver created successfully",
			year: parseInt(year),
			driver: {
				id: newDriver._id,
				name: newDriver.name,
				value: newDriver.value,
				points: newDriver.points,
				categories: newDriver.categories,
				imageURL: newDriver.imageURL,
				description: newDriver.description,
			},
		});
	})
);

router.put(
	"/:year/:id",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	yearValidation,
	mongoIdValidation(),
	updateDriverValidation,
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const updates = req.body;
		const Driver = getDriverModelForYear(year);

		const allowedUpdates = [
			"name",
			"value",
			"points",
			"categories",
			"imageURL",
			"description",
		];
		const actualUpdates = Object.keys(updates).filter((key) =>
			allowedUpdates.includes(key)
		);

		if (actualUpdates.length === 0) {
			throw new AppError("No valid fields provided for updates", 400);
		}

		const driver = await Driver.findById(id);
		if (!driver) {
			throw new AppError("Driver not found", 404);
		}

		if (updates.name) {
			updates.name = updates.name.trim();

			const existingDriver = await Driver.findOne({
				name: { $regex: new RegExp(`^${updates.name}$`, "i") },
				_id: { $ne: id },
			});

			if (existingDriver) {
				throw new AppError(
					"A driver with this name already exists for this year",
					409
				);
			}
		}

		const filteredUpdates = {};
		actualUpdates.forEach((key) => {
			filteredUpdates[key] = updates[key];
		});

		const updatedDriver = await Driver.findByIdAndUpdate(
			id,
			{ $set: filteredUpdates },
			{ new: true, runValidators: true }
		).select("-__v");

		res.status(200).json({
			success: true,
			message: "Driver updated successfully",
			year: parseInt(year),
			driver: updatedDriver,
		});
	})
);

router.delete(
	"/:year/:id",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	yearValidation,
	mongoIdValidation(),
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const Driver = getDriverModelForYear(year);

		const driverToDelete = await Driver.findById(id);
		if (!driverToDelete) {
			throw new AppError("Driver not found", 404);
		}

		await Driver.findByIdAndDelete(id);

		res.status(200).json({
			success: true,
			message: "Driver deleted successfully",
			year: parseInt(year),
			deletedDriver: {
				id: driverToDelete._id,
				name: driverToDelete.name,
				categories: driverToDelete.categories,
				value: driverToDelete.value,
				points: driverToDelete.points,
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
		const Driver = getDriverModelForYear(year);

		const [totalDrivers, totalValueAgg, totalPointsAgg, categoryStats] =
			await Promise.all([
				Driver.countDocuments(),
				Driver.aggregate([
					{ $group: { _id: null, total: { $sum: "$value" } } },
				]),
				Driver.aggregate([
					{ $group: { _id: null, total: { $sum: "$points" } } },
				]),
				Driver.aggregate([
					{ $unwind: "$categories" },
					{
						$group: {
							_id: "$categories",
							count: { $sum: 1 },
							totalValue: { $sum: "$value" },
							totalPoints: { $sum: "$points" },
						},
					},
					{ $sort: { _id: 1 } },
				]),
			]);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			stats: {
				drivers: {
					total: totalDrivers,
				},
				value: {
					total: totalValueAgg[0]?.total || 0,
				},
				points: {
					total: totalPointsAgg[0]?.total || 0,
				},
				categories: categoryStats.reduce((acc, cat) => {
					acc[cat._id] = {
						count: cat.count,
						totalValue: cat.totalValue,
						totalPoints: cat.totalPoints,
					};
					return acc;
				}, {}),
			},
		});
	})
);

router.get(
	"/",
	authenticateToken,
	catchAsync(async (req, res) => {
		const { getAvailableYears } = require("../models/modelPerYear");
		const years = await getAvailableYears();

		const yearStats = await Promise.all(
			years.map(async (year) => {
				try {
					const Driver = getDriverModelForYear(year);
					const count = await Driver.countDocuments();
					return { year, driverCount: count };
				} catch (error) {
					return { year, driverCount: 0, error: error.message };
				}
			})
		);

		res.status(200).json({
			success: true,
			message: "Available years with driver data",
			years: yearStats.filter((y) => y.driverCount > 0),
		});
	})
);

module.exports = router;
