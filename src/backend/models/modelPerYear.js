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

/**
 * Validate if the provided year is between 2000 and currentYear + 5
 * @param {string|number} year
 * @returns {boolean}
 */
function validateYear(year) {
	const yearNum = parseInt(year);
	const currentYear = new Date().getFullYear();
	return yearNum >= 2000 && yearNum <= currentYear + 5;
}

/**
 * Throws error if year is invalid.
 * @param {string|number} year
 */
function ensureValidYear(year) {
	if (!validateYear(year)) {
		throw new Error(
			`Invalid year: ${year}. Must be between 2000 and ${
				new Date().getFullYear() + 5
			}`
		);
	}
}

/**
 * Get or create Mongoose Driver model for a specific year.
 * @param {string|number} year
 * @returns {mongoose.Model} Driver model for that year
 */
function getDriverModelForYear(year) {
	ensureValidYear(year);

	const modelName = `Driver_${year}`;
	const collectionName = `drivers_${year}`;

	if (modelCache.drivers[modelName]) {
		return modelCache.drivers[modelName];
	}

	const model = mongoose.model(modelName, driverSchema, collectionName);
	modelCache.drivers[modelName] = model;

	return model;
}

/**
 * Get or create Mongoose User model for a specific year.
 * @param {string|number} year
 * @returns {mongoose.Model} User model for that year
 */
function getUserModelForYear(year) {
	ensureValidYear(year);

	const modelName = `User_${year}`;
	const collectionName = `user_${year}`;

	if (modelCache.users[modelName]) {
		return modelCache.users[modelName];
	}

	const model = mongoose.model(modelName, userSchema, collectionName);
	modelCache.users[modelName] = model;

	return model;
}

/**
 * Get or create Mongoose Race model for a specific year.
 * @param {string|number} year
 * @returns {mongoose.Model} Race model for that year
 */
function getRaceModelForYear(year) {
	ensureValidYear(year);

	const modelName = `Race_${year}`;
	const collectionName = `races_${year}`;

	if (modelCache.races[modelName]) {
		return modelCache.races[modelName];
	}

	const model = mongoose.model(
		modelName,
		raceSchemaWithEvents,
		collectionName
	);
	modelCache.races[modelName] = model;

	return model;
}

/**
 * Get or create Mongoose Roster model for a specific year.
 * @param {string|number} year
 * @returns {mongoose.Model} Roster model for that year
 */
function getRosterModelForYear(year) {
	ensureValidYear(year);

	const modelName = `Roster_${year}`;
	const collectionName = `rosters_${year}`;

	if (modelCache.rosters[modelName]) {
		return modelCache.rosters[modelName];
	}

	const yearRosterSchema = new mongoose.Schema({
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: `User_${year}`,
			required: true,
		},
		drivers: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: `Driver_${year}`,
				required: true,
			},
		],
		budgetUsed: { type: Number, default: 0, min: 0, required: true },
		race: {
			type: mongoose.Schema.Types.ObjectId,
			ref: `Race_${year}`,
			required: true,
		},
		pointsEarned: { type: Number, default: 0 },
		createdAt: { type: Date, default: Date.now },
	});

	const model = mongoose.model(modelName, yearRosterSchema, collectionName);
	modelCache.rosters[modelName] = model;

	return model;
}

/**
 * Lists all years with existing collections (drivers, users, races, rosters).
 * @returns {Promise<number[]>} Sorted array of years (descending)
 */
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

/**
 * Initializes collections (creates indexes) for all models for a given year.
 * @param {string|number} year
 * @returns {Promise<Object>} Object containing all initialized models
 */
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

/**
 * Copies data from source year to target year for specified collections.
 * Resets points and race statuses accordingly.
 * @param {string|number} sourceYear
 * @param {string|number} targetYear
 * @param {string[]} [collections=["drivers", "users"]] - Collections to copy: "drivers", "users", "races"
 * @returns {Promise<Object>} Summary of copied records count and errors
 */
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
		if (collections.includes("drivers")) {
			const sourceDriver = getDriverModelForYear(sourceYear);
			const targetDriver = getDriverModelForYear(targetYear);

			const drivers = await sourceDriver.find().lean();
			if (drivers.length > 0) {
				const driversToInsert = drivers.map(({ _id, ...driver }) => ({
					...driver,
					points: 0,
				}));

				await targetDriver.insertMany(driversToInsert);
				summary.drivers = driversToInsert.length;
			}
		}

		if (collections.includes("users")) {
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
		}

		if (collections.includes("races")) {
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
		}

		return summary;
	} catch (err) {
		summary.errors.push(err.message);
		throw err;
	}
}

/**
 * Clears all cached models for drivers, users, races, and rosters.
 */
function clearModelCache() {
	Object.keys(modelCache).forEach((type) => {
		modelCache[type] = {};
	});
}

/**
 * Retrieves summary statistics for a given year.
 * @param {string|number} year
 * @returns {Promise<Object>} Statistics including counts and totals
 */
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
