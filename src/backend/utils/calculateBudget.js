// src/backend/utils/calculateBudget.js
const mongoose = require("mongoose");
const {
	getDriverModelForYear,
	getUserModelForYear,
} = require("../models/modelPerYear");

/**
 * Validate MongoDB ObjectId
 */
function isValidObjectId(id) {
	return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Calculate the total budget used for a list of drivers
 */
async function calculateDriversBudget(driverIds, year) {
	try {
		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			return 0;
		}

		// Validate all driver IDs
		const invalidIds = driverIds.filter((id) => !isValidObjectId(id));
		if (invalidIds.length > 0) {
			throw new Error(`Invalid driver IDs: ${invalidIds.join(", ")}`);
		}

		const Driver = getDriverModelForYear(year);

		// Get all drivers by their IDs
		const drivers = await Driver.find({
			_id: { $in: driverIds },
		})
			.select("value")
			.lean();

		// Check if all drivers were found
		if (drivers.length !== driverIds.length) {
			const foundIds = drivers.map((d) => d._id.toString());
			const missingIds = driverIds.filter(
				(id) => !foundIds.includes(id.toString())
			);
			throw new Error(`Drivers not found: ${missingIds.join(", ")}`);
		}

		// Calculate total value
		const totalValue = drivers.reduce(
			(sum, driver) => sum + (driver.value || 0),
			0
		);

		return totalValue;
	} catch (error) {
		console.error("Error calculating drivers budget:", error);
		throw new Error(`Failed to calculate drivers budget: ${error.message}`);
	}
}

/**
 * Validate that the user has sufficient budget for selected drivers
 */
async function validateUserBudget(userId, driverIds, year) {
	try {
		if (!isValidObjectId(userId)) {
			throw new Error("Invalid user ID");
		}

		const User = getUserModelForYear(year);
		const user = await User.findById(userId).select("budget").lean();

		if (!user) {
			throw new Error("User not found");
		}

		const totalDriverValue = await calculateDriversBudget(driverIds, year);

		const isValid = totalDriverValue <= user.budget;
		const remainingBudget = user.budget - totalDriverValue;

		return {
			isValid,
			userBudget: user.budget,
			totalDriverValue,
			remainingBudget,
			exceedsBy: isValid ? 0 : totalDriverValue - user.budget,
		};
	} catch (error) {
		console.error("Error validating user budget:", error);
		throw error;
	}
}

/**
 * Validate driver categories to ensure required categories are present
 */
async function validateDriverCategories(
	driverIds,
	year,
	requiredCategories = ["M", "JS", "I"]
) {
	try {
		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			return {
				isValid: false,
				presentCategories: [],
				missingCategories: requiredCategories,
				requiredCategories,
			};
		}

		// Validate all driver IDs
		const invalidIds = driverIds.filter((id) => !isValidObjectId(id));
		if (invalidIds.length > 0) {
			throw new Error(`Invalid driver IDs: ${invalidIds.join(", ")}`);
		}

		const Driver = getDriverModelForYear(year);
		const drivers = await Driver.find({
			_id: { $in: driverIds },
		})
			.select("categories")
			.lean();

		// Check if all drivers were found
		if (drivers.length !== driverIds.length) {
			const foundIds = drivers.map((d) => d._id.toString());
			const missingIds = driverIds.filter(
				(id) => !foundIds.includes(id.toString())
			);
			throw new Error(`Drivers not found: ${missingIds.join(", ")}`);
		}

		// Get all unique categories from selected drivers
		const presentCategories = new Set();
		drivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((category) => {
					presentCategories.add(category);
				});
			}
		});

		// Check which required categories are missing
		const missingCategories = requiredCategories.filter(
			(category) => !presentCategories.has(category)
		);

		return {
			isValid: missingCategories.length === 0,
			presentCategories: Array.from(presentCategories),
			missingCategories,
			requiredCategories,
		};
	} catch (error) {
		console.error("Error validating driver categories:", error);
		throw error;
	}
}

/**
 * Comprehensive roster validation
 */
async function validateRosterData(rosterData, year) {
	const { user: userId, drivers: driverIds, budgetUsed } = rosterData;

	try {
		// Basic input validation
		if (!userId || !isValidObjectId(userId)) {
			throw new Error("Valid user ID is required");
		}

		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			throw new Error("At least one driver must be selected");
		}

		const invalidDriverIds = driverIds.filter((id) => !isValidObjectId(id));
		if (invalidDriverIds.length > 0) {
			throw new Error(
				`Invalid driver IDs: ${invalidDriverIds.join(", ")}`
			);
		}

		// Check for duplicate drivers
		const uniqueDrivers = new Set(driverIds.map((id) => id.toString()));
		if (uniqueDrivers.size !== driverIds.length) {
			throw new Error("Duplicate drivers are not allowed");
		}

		// Run validations in parallel
		const [budgetValidation, categoryValidation, calculatedBudget] =
			await Promise.all([
				validateUserBudget(userId, driverIds, year),
				validateDriverCategories(driverIds, year),
				calculateDriversBudget(driverIds, year),
			]);

		const errors = [];

		// Budget validation
		if (!budgetValidation.isValid) {
			errors.push(
				`Budget exceeded by £${budgetValidation.exceedsBy.toFixed(2)}`
			);
		}

		// Category validation
		if (!categoryValidation.isValid) {
			errors.push(
				`Missing required categories: ${categoryValidation.missingCategories.join(
					", "
				)}`
			);
		}

		// Budget mismatch check (allow small floating point differences)
		const budgetMismatch =
			Math.abs(calculatedBudget - (budgetUsed || 0)) > 0.01;
		if (budgetMismatch && budgetUsed !== undefined) {
			errors.push(
				`Budget mismatch: calculated £${calculatedBudget.toFixed(
					2
				)}, provided £${(budgetUsed || 0).toFixed(2)}`
			);
		}

		return {
			isValid: errors.length === 0,
			errors,
			budgetInfo: budgetValidation,
			categoryInfo: categoryValidation,
			calculatedBudget,
			providedBudget: budgetUsed || 0,
		};
	} catch (error) {
		console.error("Error in comprehensive roster validation:", error);
		throw error;
	}
}

/**
 * Validate maximum drivers constraint
 */
function validateMaxDrivers(driverIds, maxDrivers = 6) {
	if (!Array.isArray(driverIds)) {
		return {
			isValid: false,
			error: "Driver IDs must be an array",
		};
	}

	if (driverIds.length > maxDrivers) {
		return {
			isValid: false,
			error: `Cannot select more than ${maxDrivers} drivers (currently ${driverIds.length})`,
		};
	}

	return {
		isValid: true,
		error: null,
	};
}

/**
 * Get driver summary for roster
 */
async function getDriverSummary(driverIds, year) {
	try {
		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			return {
				drivers: [],
				totalValue: 0,
				categories: [],
			};
		}

		const Driver = getDriverModelForYear(year);
		const drivers = await Driver.find({
			_id: { $in: driverIds },
		})
			.select("name value categories")
			.lean();

		const totalValue = drivers.reduce(
			(sum, driver) => sum + (driver.value || 0),
			0
		);
		const allCategories = new Set();

		drivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((cat) => allCategories.add(cat));
			}
		});

		return {
			drivers: drivers.map((driver) => ({
				id: driver._id,
				name: driver.name,
				value: driver.value,
				categories: driver.categories || [],
			})),
			totalValue,
			categories: Array.from(allCategories).sort(),
		};
	} catch (error) {
		console.error("Error getting driver summary:", error);
		throw error;
	}
}

module.exports = {
	calculateDriversBudget,
	validateUserBudget,
	validateDriverCategories,
	validateRosterData,
	validateMaxDrivers,
	getDriverSummary,
	isValidObjectId,
};
