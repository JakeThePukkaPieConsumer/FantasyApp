const express = require("express");
const { body } = require("express-validator");
const PPMCalculationService = require("../services/pmmCalculation");
const {
	yearValidation,
	ppmCalculationValidation,
	mongoIdValidation,
	handleValidationErrors,
} = require("../middleware/validation");
const { authenticateToken, checkElevated } = require("../middleware/auth");
const { checkRole } = require("../middleware/rbac");
const { AppError, catchAsync } = require("../middleware/errorHandler");

const router = express.Router();

// Calculate PPM (preview only)
router.post(
	"/:year/calculate-ppm",
	authenticateToken,
	yearValidation,
	ppmCalculationValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const { raceId, totalMeetingPoints, venuePoints = 930 } = req.body;

		const ppmService = new PPMCalculationService(year);
		const result = await ppmService.calculatePPM(
			raceId,
			totalMeetingPoints,
			venuePoints
		);

		res.status(200).json({
			success: true,
			message: `PPM calculated successfully (preview only) - using venue points of ${venuePoints}`,
			year: parseInt(year),
			data: result,
		});
	})
);

router.post(
	"/:year/process-race",
	authenticateToken,
	checkRole("admin"),
	checkElevated,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const {
			raceId,
			venuePoints = 930,
			driverResults,
		} = req.body;

		const ppmService = new PPMCalculationService(year);
		const result = await ppmService.processRaceResults(
			raceId,
			driverResults,
			totalMeetingPoints,
			venuePoints
		);

		res.status(200).json({
			success: true,
			message: "Race results processed and PPM applied successfully",
			year: parseInt(year),
			data: result,
		});
	})
);

// Get PPM history (recent races)
router.get(
	"/:year/ppm-history",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const limit = parseInt(req.query.limit) || 10;

		if (limit < 1 || limit > 50) {
			throw new AppError("Limit must be between 1 and 50", 400);
		}

		const ppmService = new PPMCalculationService(year);
		const history = await ppmService.getPPMHistory(limit);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			count: history.length,
			data: history,
		});
	})
);

// Get all season PPM data
router.get(
	"/:year/season-ppm",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const ppmService = new PPMCalculationService(year);

		const seasonData = await ppmService.getAllSeasonPPM();

		res.status(200).json({
			success: true,
			message: "All season PPM data retrieved successfully",
			...seasonData,
		});
	})
);

// Get driver analysis
router.get(
	"/:year/driver-analysis/:driverId",
	authenticateToken,
	yearValidation,
	mongoIdValidation("driverId"),
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const driverId = req.params.driverId;

		const ppmService = new PPMCalculationService(year);
		const analysis = await ppmService.getDriverAnalysis(driverId);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			data: analysis,
		});
	})
);

// Get season summary
router.get(
	"/:year/season-summary",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const ppmService = new PPMCalculationService(year);

		// Get all processed races
		const history = await ppmService.getPPMHistory(100); // Get all races

		if (history.length === 0) {
			return res.status(200).json({
				success: true,
				year: parseInt(year),
				message: "No processed races found for this year",
				data: {
					totalRaces: 0,
					avgPPM: 0,
					totalPoints: 0,
					avgMeetingPoints: 0,
				},
			});
		}

		// Calculate season statistics
		const totalRaces = history.length;
		const totalPoints = history.reduce(
			(sum, race) => sum + race.totalMeetingPoints,
			0
		);
		const avgPPM =
			history.reduce((sum, race) => sum + race.ppm, 0) / totalRaces;
		const avgMeetingPoints = totalPoints / totalRaces;
		const avgVenuePoints =
			history.reduce((sum, race) => sum + (race.venuePoints || 930), 0) /
			totalRaces;
		const avgTotalDriverValue =
			history.reduce((sum, race) => sum + race.totalDriverValue, 0) /
			totalRaces;

		// Get highest and lowest PPM races
		const sortedByPPM = [...history].sort((a, b) => b.ppm - a.ppm);
		const highestPPM = sortedByPPM[0];
		const lowestPPM = sortedByPPM[sortedByPPM.length - 1];

		res.status(200).json({
			success: true,
			year: parseInt(year),
			data: {
				totalRaces,
				totalPoints,
				avgPPM: Math.round(avgPPM * 1000000) / 1000000, // Round to 6 decimal places
				avgMeetingPoints: Math.round(avgMeetingPoints * 100) / 100,
				avgVenuePoints: Math.round(avgVenuePoints * 100) / 100,
				avgTotalDriverValue:
					Math.round(avgTotalDriverValue * 100) / 100,
				highestPPM: {
					race: highestPPM.raceName,
					round: highestPPM.roundNumber,
					ppm: highestPPM.ppm,
					venuePoints: highestPPM.venuePoints,
					totalDriverValue: highestPPM.totalDriverValue,
				},
				lowestPPM: {
					race: lowestPPM.raceName,
					round: lowestPPM.roundNumber,
					ppm: lowestPPM.ppm,
					venuePoints: lowestPPM.venuePoints,
					totalDriverValue: lowestPPM.totalDriverValue,
				},
				recentRaces: history.slice(0, 5), // Last 5 races
			},
		});
	})
);

// Get value changes from most recent race
router.get(
	"/:year/value-changes",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const ppmService = new PPMCalculationService(year);

		// Get most recent processed race
		const history = await ppmService.getPPMHistory(1);

		if (history.length === 0) {
			return res.status(200).json({
				success: true,
				year: parseInt(year),
				message: "No processed races found",
				data: { increases: [], decreases: [] },
			});
		}

		const latestRace = history[0];

		// Get the race details to access driver updates
		const { getRaceModelForYear } = require("../models/modelPerYear");
		const Race = getRaceModelForYear(year);
		const raceDetails = await Race.findById(latestRace.raceId)
			.select("ppmData.driverUpdates")
			.lean();

		if (!raceDetails || !raceDetails.ppmData) {
			throw new AppError("Race data not found", 404);
		}

		const driverUpdates = raceDetails.ppmData.driverUpdates;

		// Sort by value change
		const increases = driverUpdates
			.filter((update) => update.valueChange > 0)
			.sort((a, b) => b.valueChange - a.valueChange)
			.slice(0, 10);

		const decreases = driverUpdates
			.filter((update) => update.valueChange < 0)
			.sort((a, b) => a.valueChange - b.valueChange)
			.slice(0, 10);

		res.status(200).json({
			success: true,
			year: parseInt(year),
			data: {
				race: {
					name: latestRace.raceName,
					round: latestRace.roundNumber,
					ppm: latestRace.ppm,
					venuePoints: latestRace.venuePoints,
					totalDriverValue: latestRace.totalDriverValue,
				},
				increases: increases.map((update) => ({
					driverName: update.driverName,
					previousValue: update.previousValue,
					newValue: update.newValue,
					valueChange: update.valueChange,
					pointsGained: update.pointsGained,
					expectedPoints: update.expectedPoints,
					percentageChange: update.percentageChange,
				})),
				decreases: decreases.map((update) => ({
					driverName: update.driverName,
					previousValue: update.previousValue,
					newValue: update.newValue,
					valueChange: update.valueChange,
					pointsGained: update.pointsGained,
					expectedPoints: update.expectedPoints,
					percentageChange: update.percentageChange,
				})),
			},
		});
	})
);

module.exports = router;
