const express = require("express");
const {
	getAvailableYears,
	initializeYearCollections,
	copyYearData,
	getYearStatistics,
	validateYear,
} = require("../models/modelPerYear");
const { authenticateToken, checkElevated } = require("../middleware/auth");
const { checkRole } = require("../middleware/rbac");
const { body, param } = require("express-validator");
const {
	yearValidation,
	copyYearValidation,
	handleValidationErrors,
} = require("../middleware/validation");
const { AppError, catchAsync } = require("../middleware/errorHandler");

const router = express.Router();

router.get(
	"/",
	authenticateToken,
	catchAsync(async (req, res) => {
		const years = await getAvailableYears();

		res.status(200).json({
			success: true,
			message: "Available years with data",
			count: years.length,
			years,
		});
	})
);

router.get(
	"/stats",
	authenticateToken,
	catchAsync(async (req, res) => {
		const years = await getAvailableYears();

		const yearStats = await Promise.all(
			years.map(async (year) => {
				try {
					return await getYearStatistics(year);
				} catch (error) {
					return {
						year,
						error: error.message,
						drivers: { count: 0, totalValue: 0 },
						users: { count: 0, totalBudget: 0 },
						races: { count: 0 },
						rosters: { count: 0 },
					};
				}
			})
		);

		res.status(200).json({
			success: true,
			message: "Statistics for all available years",
			years: yearStats,
		});
	})
);

router.get(
	"/:year/stats",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const stats = await getYearStatistics(year);

		res.status(200).json({
			success: true,
			stats,
		});
	})
);

router.post(
	"/:year/initialize",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;

		const existingStats = await getYearStatistics(year).catch(() => null);
		if (
			existingStats &&
			(existingStats.drivers.count > 0 ||
				existingStats.users.count > 0 ||
				existingStats.races.count > 0)
		) {
			throw new AppError(
				`Year ${year} already has existing data. Use copy endpoint to populate from another year.`,
				409
			);
		}

		const models = await initializeYearCollections(year);

		res.status(201).json({
			success: true,
			message: `Successfully initialized collections for year ${year}`,
			year: parseInt(year),
			collections: Object.keys(models),
		});
	})
);

router.post(
	"/copy",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	copyYearValidation,
	catchAsync(async (req, res) => {
		const {
			sourceYear,
			targetYear,
			collections = ["drivers", "users"],
		} = req.body;

		if (sourceYear === targetYear) {
			throw new AppError(
				"Source and target years cannot be the same",
				400
			);
		}

		const sourceStats = await getYearStatistics(sourceYear).catch(
			() => null
		);
		if (!sourceStats) {
			throw new AppError(
				`Source year ${sourceYear} has no data to copy`,
				404
			);
		}

		try {
			await initializeYearCollections(targetYear);
		} catch (error) {
			console.log(
				`Collections for ${targetYear} may already exist:`,
				error.message
			);
		}

		const summary = await copyYearData(sourceYear, targetYear, collections);

		res.status(200).json({
			success: true,
			message: `Successfully copied data from ${sourceYear} to ${targetYear}`,
			sourceYear: parseInt(sourceYear),
			targetYear: parseInt(targetYear),
			collections: collections,
			summary,
		});
	})
);

router.get(
	"/:year1/compare/:year2",
	authenticateToken,
	[
		param("year1")
			.matches(/^\d{4}$/)
			.withMessage("Year1 must be a 4-digit number"),
		param("year2")
			.matches(/^\d{4}$/)
			.withMessage("Year2 must be a 4-digit number"),
		handleValidationErrors,
	],
	catchAsync(async (req, res) => {
		const year1 = req.params.year1;
		const year2 = req.params.year2;

		if (!validateYear(year1) || !validateYear(year2)) {
			throw new AppError("Both years must be valid", 400);
		}

		const [stats1, stats2] = await Promise.all([
			getYearStatistics(year1).catch((err) => ({
				year: parseInt(year1),
				error: err.message,
			})),
			getYearStatistics(year2).catch((err) => ({
				year: parseInt(year2),
				error: err.message,
			})),
		]);

		const comparison = {
			drivers: {
				[year1]: stats1.drivers || { count: 0, totalValue: 0 },
				[year2]: stats2.drivers || { count: 0, totalValue: 0 },
				difference: {
					count:
						(stats2.drivers?.count || 0) -
						(stats1.drivers?.count || 0),
					totalValue:
						(stats2.drivers?.totalValue || 0) -
						(stats1.drivers?.totalValue || 0),
				},
			},
			users: {
				[year1]: stats1.users || { count: 0, totalBudget: 0 },
				[year2]: stats2.users || { count: 0, totalBudget: 0 },
				difference: {
					count:
						(stats2.users?.count || 0) - (stats1.users?.count || 0),
					totalBudget:
						(stats2.users?.totalBudget || 0) -
						(stats1.users?.totalBudget || 0),
				},
			},
			races: {
				[year1]: stats1.races || { count: 0 },
				[year2]: stats2.races || { count: 0 },
				difference: {
					count:
						(stats2.races?.count || 0) - (stats1.races?.count || 0),
				},
			},
		};

		res.status(200).json({
			success: true,
			message: `Comparison between ${year1} and ${year2}`,
			comparison,
		});
	})
);

router.delete(
	"/:year",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	yearValidation,
	[
		body("confirmDelete")
			.equals("DELETE_ALL_DATA")
			.withMessage(
				'Must provide confirmDelete: "DELETE_ALL_DATA" to proceed'
			),
		handleValidationErrors,
	],
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const currentYear = new Date().getFullYear();

		if (parseInt(year) === currentYear) {
			throw new AppError("Cannot delete data for the current year", 403);
		}

		const {
			getDriverModelForYear,
			getUserModelForYear,
			getRaceModelForYear,
			getRosterModelForYear,
		} = require("../models/modelPerYear");

		const statsBeforeDeletion = await getYearStatistics(year);

		const collections = ["drivers", "users", "races", "rosters"];
		const deletionResults = {};

		for (const collection of collections) {
			try {
				let Model;
				switch (collection) {
					case "drivers":
						Model = getDriverModelForYear(year);
						break;
					case "users":
						Model = getUserModelForYear(year);
						break;
					case "races":
						Model = getRaceModelForYear(year);
						break;
					case "rosters":
						Model = getRosterModelForYear(year);
						break;
				}

				const result = await Model.collection.drop();
				deletionResults[collection] = {
					success: true,
					dropped: result,
				};
			} catch (error) {
				deletionResults[collection] = {
					success: false,
					error: error.message,

					ignored: error.message.includes("ns not found"),
				};
			}
		}

		res.status(200).json({
			success: true,
			message: `All data for year ${year} has been deleted`,
			year: parseInt(year),
			statsBeforeDeletion,
			deletionResults,
		});
	})
);

module.exports = router;
