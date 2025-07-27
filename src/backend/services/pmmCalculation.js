const mongoose = require("mongoose");
const {
	getDriverModelForYear,
	getRosterModelForYear,
	getRaceModelForYear,
} = require("../models/modelPerYear");

class PPMCalculationService {
	constructor(year) {
		this.year = year;
		this.Driver = getDriverModelForYear(year);
		this.Roster = getRosterModelForYear(year);
		this.Race = getRaceModelForYear(year);
	}

	async calculatePPM(raceId, venuePoints = 930) {
		try {
			// Validate race exists
			const race = await this.Race.findById(raceId);
			if (!race) {
				throw new Error("Race not found");
			}

			const drivers = await this.Driver.find({})
				.select("_id name currentValue previousValue value")
				.lean();

			if (drivers.length === 0) {
				throw new Error("No drivers found for PPM calculation");
			}

			console.log(`Found ${drivers.length} drivers for PPM calculation`);
			drivers.forEach((driver) => {
				console.log(
					`Driver ${driver.name}: currentValue=${driver.currentValue}, previousValue=${driver.previousValue}, value=${driver.value}`
				);
			});


			const totalDriverValue = drivers.reduce((sum, driver) => {
				console.log(driver.currentValue);
				const driverValue = driver.currentValue ?? 0;
				console.log(
					`Adding driver ${driver.name} value: ${driverValue}`
				);
				return sum + driverValue;
			}, 0);

			console.log(`Calculated Total Driver Value: ${totalDriverValue}`);

			if (totalDriverValue === 0) {
				throw new Error(
					`Total driver value cannot be zero for PPM calculation. Check that drivers have currentValue or value set.`
				);
			}

			const ppm = venuePoints / totalDriverValue; ///< PPM = VP / TDV

			const driverUpdates = drivers.map((driver) => {
				const currentValue = driver.currentValue || 0;
				const expectedPoints = this.calculateExpectedPoints(
					currentValue,
					ppm
				);

				return {
					driverId: driver._id,
					driverName: driver.name,
					previousValue: currentValue, 
					expectedPoints: expectedPoints,
					pointsGained: 0,
					valueChange: 0,
					newValue: currentValue,
					percentageChange: 0,
				};
			});

			return {
				success: true,
				raceId,
				raceName: race.name,
				roundNumber: race.roundNumber,
				venuePoints,
				totalDriverValue,
				ppm,
				driversCount: drivers.length,
				driverUpdates,
				calculatedAt: new Date(),
			};
		} catch (error) {
			console.error(`Error calculating PPM for race ${raceId}:`, error);
			throw error;
		}
	}

	calculateExpectedPoints(driverValue, ppm) {
		return driverValue * ppm; ///< XP = DV * PPM
	}

	calculatePercentageChange(pointsGained, pointsExpected) {
		if (pointsExpected === 0) return 0;
		return (pointsGained - pointsExpected) / pointsExpected / 100; ///< PC = (PG - PX) / PX / 100
	}

	calculateNewDriverValue(previousValue, pointsGained, pointsExpected) {
		const changePercent = this.calculatePercentageChange(
			pointsGained,
			pointsExpected
		);
		const valueChange = previousValue * changePercent;
		return Math.max(0, previousValue + valueChange); ///< NDV = PDV = (PDV * PC)
	}

	// For user display
	calculateDisplayPercentageChange(previousValue, newValue) {
		if (previousValue === 0) return 0;
		return ((newValue - previousValue) / previousValue) * 100;
	}

	async processRaceResults(
		raceId,
		driverResults,
		venuePoints = 930
	) {
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			const race = await this.Race.findById(raceId).session(session);
			if (!race) {
				throw new Error("Race not found");
			}

			if (race.isProcessed) {
				throw new Error("Race results have already been processed");
			}

			const allDrivers = await this.Driver.find({}).session(session);

			// Calculate Total Driver Value for PPM calculation
			const totalDriverValue = allDrivers.reduce((sum, driver) => {
				return sum + (driver.currentValue || 0);
			}, 0);

			if (totalDriverValue === 0) {
				throw new Error(
					"Total driver value cannot be zero for PPM calculation"
				);
			}

			const ppm = venuePoints / totalDriverValue;

			const resultsMap = new Map(
				driverResults.map((result) => [
					result.driverId.toString(),
					result.pointsGained,
				])
			);

			const driverUpdates = [];

			for (const driver of allDrivers) {
				const driverId = driver._id.toString();
				const pointsGained = resultsMap.get(driverId) || 0;
				const previousValue = driver.currentValue || 0;

				const expectedPoints = this.calculateExpectedPoints(
					previousValue,
					ppm
				);

				const changePercent = this.calculatePercentageChange(
					pointsGained,
					expectedPoints
				);

				const newValue = this.calculateNewDriverValue(
					previousValue,
					pointsGained,
					expectedPoints
				);
				const valueChange = newValue - previousValue;
				const displayPercentageChange = changePercent * 100; 

				await this.Driver.findByIdAndUpdate(
					driver._id,
					{
						$set: {
							previousValue: previousValue, 
							currentValue: newValue, 
							points: (driver.points || 0) + pointsGained,
						},
					},
					{ session, new: true }
				);

				driverUpdates.push({
					driverId: driver._id,
					driverName: driver.name,
					previousValue,
					pointsGained,
					expectedPoints,
					valueChange,
					newValue,
					percentageChange: displayPercentageChange,
					changePercent: changePercent,
				});
			}

			await this.Race.findByIdAndUpdate(
				raceId,
				{
					$set: {
						isProcessed: true,
						ppmData: {
							ppm,
							venuePoints,
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
				raceName: race.name,
				roundNumber: race.roundNumber,
				ppm,
				venuePoints,
				totalDriverValue,
				driversProcessed: driverUpdates.length,
				driverUpdates,
				processedAt: new Date(),
			};
		} catch (error) {
			await session.abortTransaction();
			throw error;
		} finally {
			session.endSession();
		}
	}

	async getPPMHistory(limit = 10) {
		try {
			const races = await this.Race.find({
				isProcessed: true,
				"ppmData.ppm": { $exists: true },
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
				venuePoints: race.ppmData.venuePoints,
				totalDriverValue: race.ppmData.totalDriverValue,
				processedAt: race.ppmData.processedAt,
			}));
		} catch (error) {
			console.error("Error getting PPM history:", error);
			throw error;
		}
	}

	async getAllSeasonPPM() {
		try {
			const races = await this.Race.find({
				isProcessed: true,
				"ppmData.ppm": { $exists: true },
			})
				.select("name roundNumber ppmData")
				.sort({ roundNumber: 1 })
				.lean();

			return {
				success: true,
				year: parseInt(this.year),
				totalRaces: races.length,
				races: races.map((race) => ({
					raceId: race._id,
					raceName: race.name,
					roundNumber: race.roundNumber,
					ppm: race.ppmData.ppm,
					venuePoints: race.ppmData.venuePoints,
					totalDriverValue: race.ppmData.totalDriverValue,
					processedAt: race.ppmData.processedAt,
				})),
			};
		} catch (error) {
			console.error("Error getting all season PPM:", error);
			throw error;
		}
	}

	async getDriverAnalysis(driverId) {
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
				const driverUpdate = race.ppmData.driverUpdates.find(
					(update) =>
						update.driverId.toString() === driverId.toString()
				);

				if (driverUpdate) {
					performance.push({
						raceId: race._id,
						raceName: race.name,
						roundNumber: race.roundNumber,
						previousValue: driverUpdate.previousValue,
						newValue: driverUpdate.newValue,
						pointsGained: driverUpdate.pointsGained,
						valueChange: driverUpdate.valueChange,
						percentageChange: driverUpdate.percentageChange,
						ppm: race.ppmData.ppm,
						venuePoints: race.ppmData.venuePoints,
					});
				}
			}

			const totalRaces = performance.length;
			const totalPointsGained = performance.reduce(
				(sum, p) => sum + p.pointsGained,
				0
			);
			const totalValueChange = performance.reduce(
				(sum, p) => sum + p.valueChange,
				0
			);
			const avgPointsGained =
				totalRaces > 0 ? totalPointsGained / totalRaces : 0;

			return {
				driver: {
					id: driver._id,
					name: driver.name,
					currentValue: driver.currentValue,
					previousValue: driver.previousValue,
					totalPoints: driver.points || 0,
				},
				performance,
				statistics: {
					totalRaces,
					totalPointsGained,
					totalValueChange: Math.round(totalValueChange * 100) / 100,
					avgPointsGained: Math.round(avgPointsGained * 100) / 100,
					avgValueChange:
						totalRaces > 0
							? Math.round(
									(totalValueChange / totalRaces) * 100
							  ) / 100
							: 0,
				},
			};
		} catch (error) {
			console.error("Error getting driver analysis:", error);
			throw error;
		}
	}

	async simulatePPMResults(raceId, driverResults, venuePoints = 930) {
		try {
			const race = await this.Race.findById(raceId);
			if (!race) {
				throw new Error("Race not found");
			}

			const allDrivers = await this.Driver.find({}).lean();

			const totalDriverValue = allDrivers.reduce((sum, driver) => {
				return sum + (driver.currentValue || 0);
			}, 0);

			const ppm = venuePoints / totalDriverValue;

			const resultsMap = new Map(
				driverResults.map((result) => [
					result.driverId.toString(),
					result.pointsGained,
				])
			);

			const simulatedChanges = allDrivers.map((driver) => {
				const pointsGained = resultsMap.get(driver._id.toString()) || 0;
				const previousValue = driver.currentValue || 0;
				const expectedPoints = this.calculateExpectedPoints(
					previousValue,
					ppm
				);
				const newValue = this.calculateNewDriverValue(
					previousValue,
					pointsGained,
					expectedPoints
				);
				const valueChange = newValue - previousValue;
				const changePercent = this.calculatePercentageChange(
					pointsGained,
					expectedPoints
				);
				const displayPercentageChange = changePercent * 100;

				return {
					driverId: driver._id,
					driverName: driver.name,
					previousValue,
					pointsGained,
					expectedPoints,
					newValue,
					valueChange,
					percentageChange: displayPercentageChange,
					changePercent: changePercent,
				};
			});

			return {
				success: true,
				simulation: true,
				raceId,
				raceName: race.name,
				roundNumber: race.roundNumber,
				ppm,
				venuePoints,
				totalDriverValue,
				driverChanges: simulatedChanges,
				totalValueAfter: simulatedChanges.reduce(
					(sum, driver) => sum + driver.newValue,
					0
				),
			};
		} catch (error) {
			console.error("Error simulating PPM results:", error);
			throw error;
		}
	}
}

module.exports = PPMCalculationService;
