const express = require("express");
const mongoose = require("mongoose");
const {
	getRaceModelForYear,
	validateYear,
	getAvailableYears,
} = require("../models/modelPerYear");
const {
	mongoIdValidation,
	yearValidation,
} = require("../middleware/validation");
const { AppError, catchAsync } = require("../middleware/errorHandler");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

/**
 * @route GET /
 * @description Get available years with race data
 * @access Protected
 * @returns {Object} JSON with success, message, and years array with race counts
 */
router.get(
	"/",
	authenticateToken,
	catchAsync(async (req, res) => {
		const years = await getAvailableYears();

		const yearStats = await Promise.all(
			years.map(async (year) => {
				try {
					const Race = getRaceModelForYear(year);
					const count = await Race.countDocuments();
					return { year, raceCount: count };
				} catch (error) {
					return { year, raceCount: 0, error: error.message };
				}
			})
		);

		res.status(200).json({
			success: true,
			message: "Available years with race data",
			years: yearStats.filter((y) => y.raceCount > 0),
		});
	})
);

/**
 * @route GET /:year
 * @description Get all races for a specific year with optional filtering and sorting
 * @param {string} year - Year to query
 * @query {string} [status] - Filter by race status (scheduled, active, completed)
 * @query {string} [sort] - Field to sort by (roundNumber, name, date, submissionDeadline)
 * @query {string} [order] - Sort order ('asc' or 'desc')
 * @access Protected
 * @returns {Object} JSON with success, year, count, and races array
 */
router.get(
	"/:year",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Race = getRaceModelForYear(year);

		const { status, sort = "roundNumber", order = "asc" } = req.query;

		// Build query
		let query = {};
		if (status && ["scheduled", "active", "completed"].includes(status)) {
			query.status = status;
		}

		// Build sort options
		const sortOrder = order === "desc" ? -1 : 1;
		const sortOptions = {};
		if (["roundNumber", "name", "date", "submissionDeadline", "isLocked"].includes(sort)) {
			sortOptions[sort] = sortOrder;
		} else {
			sortOptions.roundNumber = 1; // Default sort by round number
		}

		const races = await Race.find(query)
			.select("-__v")
			.sort(sortOptions);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			count: races.length,
			races,
		});
	})
);

/**
 * @route GET /:year/:id
 * @description Get a specific race by ID for a given year
 * @param {string} year - Year to query
 * @param {string} id - Race ID (MongoDB ObjectId)
 * @access Protected
 * @returns {Object} JSON with success, year, and race object
 * @throws {AppError} 404 if race not found
 */
router.get(
	"/:year/:id",
	authenticateToken,
	yearValidation,
	mongoIdValidation(),
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const Race = getRaceModelForYear(year);

		const race = await Race.findById(id).select("-__v");

		if (!race) {
			throw new AppError("Race not found", 404);
		}

		res.status(200).json({
			success: true,
			year: parseInt(year),
			race,
		});
	})
);

/**
 * @route GET /:year/stats
 * @description Get aggregate race statistics for a given year
 * @param {string} year - Year to get stats for
 * @access Protected
 * @returns {Object} JSON with success, year, and stats object
 */
router.get(
	"/:year/stats",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Race = getRaceModelForYear(year);

		const [
			totalRaces,
			statusStats,
			lockedRaces,
			upcomingRaces,
			completedRaces,
		] = await Promise.all([
			Race.countDocuments(),
			Race.aggregate([
				{
					$group: {
						_id: "$status",
						count: { $sum: 1 },
					},
				},
			]),
			Race.countDocuments({ isLocked: true }),
			Race.countDocuments({ 
				status: "scheduled",
				submissionDeadline: { $gt: new Date() }
			}),
			Race.countDocuments({ status: "completed" }),
		]);

		// Convert status stats to object
		const statusCounts = statusStats.reduce((acc, stat) => {
			acc[stat._id] = stat.count;
			return acc;
		}, {});

		res.status(200).json({
			success: true,
			year: parseInt(year),
			stats: {
				races: {
					total: totalRaces,
					scheduled: statusCounts.scheduled || 0,
					active: statusCounts.active || 0,
					completed: statusCounts.completed || 0,
				},
				locked: lockedRaces,
				upcoming: upcomingRaces,
				finished: completedRaces,
			},
		});
	})
);

/**
 * @route GET /:year/upcoming
 * @description Get upcoming races (not yet past submission deadline)
 * @param {string} year - Year to query
 * @access Protected
 * @returns {Object} JSON with success, year, count, and races array
 */
router.get(
	"/:year/upcoming",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Race = getRaceModelForYear(year);

		const upcomingRaces = await Race.find({
			submissionDeadline: { $gt: new Date() },
		})
			.select("-__v")
			.sort({ submissionDeadline: 1 });

		res.status(200).json({
			success: true,
			year: parseInt(year),
			count: upcomingRaces.length,
			races: upcomingRaces,
		});
	})
);

/**
 * @route GET /:year/current
 * @description Get the current active race (closest upcoming or currently active)
 * @param {string} year - Year to query
 * @access Protected
 * @returns {Object} JSON with success, year, and race object (null if none)
 */
router.get(
	"/:year/current",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const Race = getRaceModelForYear(year);

		// First try to find an active race
		let currentRace = await Race.findOne({ status: "active" })
			.select("-__v")
			.sort({ roundNumber: 1 });

		// If no active race, find the next upcoming race
		if (!currentRace) {
			currentRace = await Race.findOne({
				status: "scheduled",
				submissionDeadline: { $gt: new Date() },
			})
				.select("-__v")
				.sort({ submissionDeadline: 1 });
		}

		res.status(200).json({
			success: true,
			year: parseInt(year),
			race: currentRace,
		});
	})
);

/**
 * @route GET /:year/by-round/:roundNumber
 * @description Get a race by its round number for a given year
 * @param {string} year - Year to query
 * @param {number} roundNumber - Round number of the race
 * @access Protected
 * @returns {Object} JSON with success, year, and race object
 * @throws {AppError} 404 if race not found, 400 if invalid round number
 */
router.get(
	"/:year/by-round/:roundNumber",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const { year, roundNumber } = req.params;
		const Race = getRaceModelForYear(year);

		const roundNum = parseInt(roundNumber);
		if (isNaN(roundNum) || roundNum < 1) {
			throw new AppError("Invalid round number", 400);
		}

		const race = await Race.findOne({ roundNumber: roundNum }).select("-__v");

		if (!race) {
			throw new AppError(`Race not found for round ${roundNum}`, 404);
		}

		res.status(200).json({
			success: true,
			year: parseInt(year),
			race,
		});
	})
);

module.exports = router;