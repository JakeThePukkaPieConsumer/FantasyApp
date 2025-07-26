const mongoose = require("mongoose");
const {
	getDriverModelForYear,
	getRosterModelForYear,
	getRaceModelForYear,
} = require("../models/modelPerYear");

class PPMCalculationsService {
	constructor(year) {
		this.year = year;
		this.Driver = getDriverModelForYear(year);
		this.Roster = getRosterModelForYear(year);
		this.Race = getRaceModelForYear(year);
		this.VP = 930; ///< Venue points
	}

	// Calculate PPM for race meeting. REM: Each track starts with 930 as a baseline ppm
	async calculatePPM(raceId, totalMeetingPoints, useBaseline = true) {
		try {
			// Get all drivers with their current values (these become "previous values" for this calculation)
			const drivers = await this.Driver.find({})
				.select("_id value")
				.lean();

			if (drivers.length === 0) {
				throw new Error("No drivers found for PPM calculations");
			}

			// Calculate total driver value (TDV) for previous driver value (PDV)
			const totalDriverValue = drivers.reduce(
				(sum, driver) => sum + (driver.value || 0),
				0
			);

			if (totalDriverValue === 0) {
				throw new Error(
					"Total driver value cannot be zero for PPM calculations"
				);
			}

			const ppm = this.VP / totalDriverValue; ///< PPM = VP / TDV

			return {
				success: true,
				raceId,
				totalMeetingPoints,
				totalDriverValue,
				ppm,
				driversCount: drivers.length,
				calculatedAt: new Date(),
			};
		} catch (err) {
			console.error(`Error calculating PPM:`, err);
			throw err;
		}
	}

	// Calculate expected points for a driver
	calculateExpectedPoints(driverValue, ppm) {
		return driverValue * ppm; ///< EP = DV * PPM
	}

	// Calculate value change for a driver
	calculateValueChange(pointsGained, expectedPoints) {
		if (expectedPoints === 0) return 0;
		return (pointsGained - expectedPoints) / expectedPoints / 100; ///<  VC = (PG - EP) / EP / 100
	}

	// Calculate new driver value
	calculateNewDriverValue(previousValue, valueChange) {
		return previousValue + valueChange; ///< NDV = PV + VC
	}

	// Process race results and all driver values
	async processRaceResults(raceId, driverResults, totalMeetingPoints) {
		const session = await mongoose.startSession();
		session.startTransaction();

		let venuePoints = this.VP;

		try {
			const race = await this.Race.findById(raceId).session(session); ///< Validate the race
			if (!race) {
				throw new Error("Race not found");
			}

			if (race.isProcessed) {
				throw new Error("Race results have already been processed");
			}

			// Calculate PPM for this race
			const ppmResult = await this.calculatePPM(
				raceId,
				totalMeetingPoints
			);
			const { ppm, totalDriverValue } = ppmResult;

			const allDrivers = await this.Driver.find({}).session(session);

			const resultsMap = new Map(
				driverResults.map((result) => [
					result.driverId.toString(),
					result.pointsGained,
				])
			);

			const updateResults = [];
			const driverUpdates = [];

			for (const driver of allDrivers) {
				const driverId = driver._id.toString();
				const pointsGained = resultsMap.get(driverId) || 0; ///< Zero points if not in result
				const previousValue = driver.value;

				const expectedPoints = this.calculateExpectedPoints(
					previousValue,
					ppm
				);
				const valueChange = this.calculateValueChange(
					pointsGained,
					expectedPoints
				);
				const newValue = this.calculateNewDriverValue(
					previousValue,
					valueChange
				);

				await this.Driver.findByIdAndUpdate(
					driver._id,
					{
						$set: {
							value: Math.max(0, newValue),
							points: (driver.points || 0) + pointsGained,
						},
					},
					{ session, new: true }
				);

				updateResults.push(updateResults);
				driverUpdates.push(updateResults);
			}

			await this.Race.findByIdAndUpdate(
				raceId,
				{
					$set: {
						isProcessed: true,
						ppmData: {
							ppm,
							venuePoints,
							totalMeetingPoints,
							totalDriverValue,
							processedAt: new Date(),
							driverUpdates,
						},
					},
				},
				{ session }
			);

			await session.commitTransaction();

			return {
				success: true,
				raceId,
				ppm,
				venuePoints,
				totalMeetingPoints,
				totalDriverValue,
				driversProcessed: updateResults.length,
				driverUpdates: updateResults,
				processedAt: new Date(),
			};
		} catch (err) {
			await session.abortTransaction();
			throw err;
		} finally {
			session.endSession();
		}
	}

	async getPPMHistory(limit = 10) {
		try {
			const races = await this.Race.find({
				isProcessed: true,
				"pmmData.pmm": { $exists: true },
			})
				.select("name roundNumber ppmData")
				.sort({ roundNumber: -1 })
				.limit(limit)
				.lean();

			return races.map((race) => ({
				raceId: race._id,
				raceName: race.name,
				roundNumber: race.roundNumber,
				ppm: race.ppmData.ppm,
				totalMeetingPoints: race.ppmData.totalMeetingPoints,
				totalDriverValue: race.ppmData.totalDriverValue,
				processedAt: race.ppmData.processedAt,
			}));
		} catch (err) {
			console.error("Error getting PPM history", err);
			throw err;
		}
	}

	async getDriveAnalysis(driverId) {
		try {
			const driver = await this.Driver.findById(driverId);
			if (!driver) {
				throw new Error("Driver not found");
			}

			const races = await this.Race.find({
				isProcessed: true,
				"ppmData.driverUpdates.driverId": driverId,
			})
				.select("name roundNumber ppmData")
				.sort({ roundNumber: 1 })
				.lean();

			const performance = [];
			for (const race of races) {
				const driverUpdates = race.ppmData.driverUpdates.find(
					(update) =>
						update.driverId.toString() === driverId.toString()
				);

				if (driverUpdates) {
					performance.push({
						raceId: race._id,
						raceName: race.name,
						roundNumber: race.roundNumber,
						previousValue: driverUpdate.previousValue,
						newValue: driverUpdate.newValue,
						pointsGained: driverUpdate.pointsGained,
						expectedPoints: driverUpdate.expectedPoints,
						valueChange: driverUpdate.valueChange,
						percentageChange: driverUpdate.percentageChange,
						outperformed:
							driverUpdate.pointsGained >
							driverUpdate.expectedPoints,
					});
				}

				const totalRaces = performance.length;
				const outperformances = performance.filter(
					(p) => p.outperformed
				).length;
				const avgPointsGained =
					totalRaces > 0
						? performance.reduce(
								(sum, p) => sum + p.pointsGained,
								0
						  ) / totalRaces
						: 0;
				const avgExpectedPoints =
					totalRaces > 0
						? performance.reduce(
								(sum, p) => sum + p.expectedPoints,
								0
						  ) / totalRaces
						: 0;

				return {
					driver: {
						id: driver._id,
						name: driver.name,
						currentValue: driver.value,
						totalPoints: driver.points,
					},
					performance,
					statistics: {
						totalRaces,
						outperformances,
						outperformanceRate:
							totalRaces > 0
								? (outperformances / totalRaces) * 100
								: 0,
						avgPointsGained,
						avgExpectedPoints,
						avgPerformanceDiff: avgPointsGained - avgExpectedPoints,
					},
				};
			}
		} catch (err) {
			console.error("Error getting driver analysis:", err);
			throw err;
		}
	}
}

module.exports = PPMCalculationsService;