const mongoose = require("mongoose");
const driverSchema = require("./driverSchema");
const userSchema = require("./userSchema");
const raceSchemaWithEvents = require("./raceSchema");

const modelCache = {
	drivers: {},
	users: {},
	races: {},
	rosters: {},
};

function validateYear(year) {
	const yearNum = parseInt(year);
	const currentYear = new Date().getFullYear();
	return yearNum >= 2000 && yearNum <= currentYear + 5;
}

function ensureValidYear(year) {
	if (!validateYear(year)) {
		throw new Error(
			`Invalid year: ${year}. Must be between 2000 and ${
				new Date().getFullYear() + 5
			}`
		);
	}
}

function getModelForYear(modelType, year, schema, collectionPrefix) {
	ensureValidYear(year);

	const modelName = `${modelType}_${year}`;
	const collectionName = `${collectionPrefix}_${year}`;

	if (modelCache[collectionPrefix][modelName]) {
		return modelCache[collectionPrefix][modelName];
	}

	try {
		const existingModel = mongoose.model(modelName);
		modelCache[collectionPrefix][modelName] = existingModel;
		return existingModel;
	} catch (error) {
		const model = mongoose.model(modelName, schema, collectionName);
		modelCache[collectionPrefix][modelName] = model;
		return model;
	}
}

function getDriverModelForYear(year) {
	return getModelForYear("Driver", year, driverSchema, "drivers");
}

function getUserModelForYear(year) {
	return getModelForYear("User", year, userSchema, "users");
}

function getRaceModelForYear(year) {
	return getModelForYear("Race", year, raceSchemaWithEvents, "races");
}

function getRosterModelForYear(year) {
	ensureValidYear(year);

	const modelName = `Roster_${year}`;
	const collectionName = `rosters_${year}`;

	if (modelCache.rosters[modelName]) {
		return modelCache.rosters[modelName];
	}

	try {
		const existingModel = mongoose.model(modelName);
		modelCache.rosters[modelName] = existingModel;
		return existingModel;
	} catch (error) {
		const yearRosterSchema = new mongoose.Schema({
			user: {
				type: mongoose.Schema.Types.ObjectId,
				ref: `User_${year}`,
				required: true,
				index: true,
			},
			drivers: [
				{
					type: mongoose.Schema.Types.ObjectId,
					ref: `Driver_${year}`,
					required: true,
				},
			],
			budgetUsed: {
				type: Number,
				default: 0,
				min: 0,
				required: true,
			},
			race: {
				type: mongoose.Schema.Types.ObjectId,
				ref: `Race_${year}`,
				required: true,
				index: true,
			},
			pointsEarned: {
				type: Number,
				default: 0,
			},
			createdAt: {
				type: Date,
				default: Date.now,
				index: true,
			},
			updatedAt: {
				type: Date,
				default: Date.now,
			},
		});

		yearRosterSchema.index({ user: 1, race: 1 }, { unique: true });

		yearRosterSchema.pre("save", function (next) {
			this.updatedAt = new Date();
			next();
		});

		const model = mongoose.model(
			modelName,
			yearRosterSchema,
			collectionName
		);
		modelCache.rosters[modelName] = model;
		return model;
	}
}

async function getAvailableYears() {
	try {
		const collections = await mongoose.connection.db
			.listCollections()
			.toArray();
		const years = new Set();

		collections.forEach((collection) => {
			const name = collection.name;
			const match = name.match(/^(drivers|users|races|rosters)_(\d{4})$/);
			if (match) {
				years.add(parseInt(match[2]));
			}
		});

		return Array.from(years).sort((a, b) => b - a);
	} catch (err) {
		console.error("Error getting available years:", err);
		return [];
	}
}

async function initializeYearCollections(year) {
	ensureValidYear(year);

	try {
		const models = {
			Driver: getDriverModelForYear(year),
			User: getUserModelForYear(year),
			Race: getRaceModelForYear(year),
			Roster: getRosterModelForYear(year),
		};

		await Promise.all([
			models.Driver.init(),
			models.User.init(),
			models.Race.init(),
			models.Roster.init(),
		]);

		console.log(`Initialized collections for year ${year}`);
		return models;
	} catch (err) {
		console.error(
			`Failed to initialize collections for year ${year}:`,
			err
		);
		throw err;
	}
}

async function copyYearData(
	sourceYear,
	targetYear,
	collections = ["drivers", "users"]
) {
	ensureValidYear(sourceYear);
	ensureValidYear(targetYear);

	const summary = {
		drivers: 0,
		users: 0,
		races: 0,
		errors: [],
	};

	try {
		const copyOperations = {
			drivers: async () => {
				const sourceDriver = getDriverModelForYear(sourceYear);
				const targetDriver = getDriverModelForYear(targetYear);

				const drivers = await sourceDriver.find().lean();
				if (drivers.length > 0) {
					const driversToInsert = drivers.map(
						({ _id, ...driver }) => ({
							...driver,
							points: 0,
						})
					);

					await targetDriver.insertMany(driversToInsert);
					summary.drivers = driversToInsert.length;
				}
			},

			users: async () => {
				const sourceUser = getUserModelForYear(sourceYear);
				const targetUser = getUserModelForYear(targetYear);

				const users = await sourceUser.find().lean();
				if (users.length > 0) {
					const usersToInsert = users.map(({ _id, ...user }) => ({
						...user,
						points: 0,
					}));

					await targetUser.insertMany(usersToInsert);
					summary.users = usersToInsert.length;
				}
			},

			races: async () => {
				const SourceRace = getRaceModelForYear(sourceYear);
				const TargetRace = getRaceModelForYear(targetYear);

				const races = await SourceRace.find().lean();
				if (races.length > 0) {
					const racesToInsert = races.map(
						({ _id, events = [], ...race }) => ({
							...race,
							isLocked: false,
							events: events.map(({ _id, ...event }) => ({
								...event,
								status: "scheduled",
							})),
						})
					);

					await TargetRace.insertMany(racesToInsert);
					summary.races = racesToInsert.length;
				}
			},
		};

		await Promise.all(
			collections
				.filter((collection) => copyOperations[collection])
				.map((collection) => copyOperations[collection]())
		);

		return summary;
	} catch (err) {
		summary.errors.push(err.message);
		throw err;
	}
}

function clearModelCache() {
	Object.keys(modelCache).forEach((type) => {
		modelCache[type] = {};
	});
}

async function getYearStatistics(year) {
	ensureValidYear(year);

	try {
		const Driver = getDriverModelForYear(year);
		const User = getUserModelForYear(year);
		const Race = getRaceModelForYear(year);
		const Roster = getRosterModelForYear(year);

		const [
			driverCount,
			userCount,
			raceCount,
			rosterCount,
			totalDriverValue,
			totalUserBudget,
		] = await Promise.all([
			Driver.countDocuments(),
			User.countDocuments(),
			Race.countDocuments(),
			Roster.countDocuments(),
			Driver.aggregate([
				{ $group: { _id: null, total: { $sum: "$value" } } },
			]),
			User.aggregate([
				{ $group: { _id: null, total: { $sum: "$budget" } } },
			]),
		]);

		return {
			year: parseInt(year),
			drivers: {
				count: driverCount,
				totalValue: totalDriverValue[0]?.total || 0,
			},
			users: {
				count: userCount,
				totalBudget: totalUserBudget[0]?.total || 0,
			},
			races: { count: raceCount },
			rosters: {
				count: rosterCount,
			},
		};
	} catch (error) {
		console.error(`Error getting statistics for year ${year}:`, error);
		throw error;
	}
}

module.exports = {
	getDriverModelForYear,
	getUserModelForYear,
	getRaceModelForYear,
	getRosterModelForYear,
	getAvailableYears,
	initializeYearCollections,
	copyYearData,
	clearModelCache,
	getYearStatistics,
	validateYear,
};
