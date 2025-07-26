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

module.exports = router;