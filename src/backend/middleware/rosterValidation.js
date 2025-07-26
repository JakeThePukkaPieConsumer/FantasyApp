const mongoose = require("mongoose");
const {
	getDriverModelForYear,
	getUserModelForYear,
} = require("../models/modelPerYear");

function isValidObjectId(id) {
	return mongoose.Types.ObjectId.isValid(id);
}

async function calculateDriversBudget(driverIds, year) {
	try {
		if (!Array.isArray(driverIds) || driverIds.length === 0) {
			return 0;
		}

		const invalidIds = driverIds.filter((id) => !isValidObjectId(id));
		if (invalidIds.length > 0) {
			throw new Error(`Invalid driver IDs: ${invalidIds.join(", ")}`);
		}

		const Driver = getDriverModelForYear(year);

		const drivers = await Driver.find({
			_id: { $in: driverIds },
		})
			.select("value")
			.lean();

		if (drivers.length !== driverIds.length) {
			const foundIds = drivers.map((d) => d._id.toString());
			const missingIds = driverIds.filter(
				(id) => !foundIds.includes(id.toString())
			);
			throw new Error(`Drivers not found: ${missingIds.join(", ")}`);
		}

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

async function validateUserBudget(rosterData, year) {
	try {
		const { user: userId, drivers: driverIds } = rosterData;

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

async function updateUserBudget(userId, driverIds, year, session = null) {
	try {
		if (!isValidObjectId(userId)) {
			throw new Error("Invalid user ID");
		}

		const User = getUserModelForYear(year);
		const totalDriverValue = await calculateDriversBudget(driverIds, year);

		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $inc: { budget: -totalDriverValue } },
			{ new: true, session }
		).select("budget");

		if (!updatedUser) {
			throw new Error("User not found");
		}

		return {
			success: true,
			deductedAmount: totalDriverValue,
			remainingBudget: updatedUser.budget,
		};
	} catch (error) {
		console.error("Error updating user budget:", error);
		throw error;
	}
}

async function restoreUserBudget(userId, driverIds, year, session = null) {
	try {
		if (!isValidObjectId(userId)) {
			throw new Error("Invalid user ID");
		}

		const User = getUserModelForYear(year);
		const totalDriverValue = await calculateDriversBudget(driverIds, year);

		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $inc: { budget: totalDriverValue } },
			{ new: true, session }
		).select("budget");

		if (!updatedUser) {
			throw new Error("User not found");
		}

		return {
			success: true,
			restoredAmount: totalDriverValue,
			remainingBudget: updatedUser.budget,
		};
	} catch (error) {
		console.error("Error restoring user budget:", error);
		throw error;
	}
}

async function handleBudgetUpdate(
	userId,
	oldDriverIds,
	newDriverIds,
	year,
	session = null
) {
	try {
		const [oldBudget, newBudget] = await Promise.all([
			calculateDriversBudget(oldDriverIds, year),
			calculateDriversBudget(newDriverIds, year),
		]);

		const budgetDifference = newBudget - oldBudget;

		if (budgetDifference === 0) {
			return {
				success: true,
				budgetChange: 0,
				message: "No budget change required",
			};
		}

		const User = getUserModelForYear(year);

		const updatedUser = await User.findByIdAndUpdate(
			userId,
			{ $inc: { budget: -budgetDifference } },
			{ new: true, session }
		).select("budget");

		if (!updatedUser) {
			throw new Error("User not found");
		}

		return {
			success: true,
			budgetChange: budgetDifference,
			remainingBudget: updatedUser.budget,
			message:
				budgetDifference > 0
					? `Deducted £${budgetDifference.toFixed(2)} from budget`
					: `Restored £${Math.abs(budgetDifference).toFixed(
							2
					  )} to budget`,
		};
	} catch (error) {
		console.error("Error handling budget update:", error);
		throw error;
	}
}

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

		if (drivers.length !== driverIds.length) {
			const foundIds = drivers.map((d) => d._id.toString());
			const missingIds = driverIds.filter(
				(id) => !foundIds.includes(id.toString())
			);
			throw new Error(`Drivers not found: ${missingIds.join(", ")}`);
		}

		const presentCategories = new Set();
		drivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((category) => {
					presentCategories.add(category);
				});
			}
		});

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

async function validateRosterData(rosterData, year) {
	const { user: userId, drivers: driverIds, budgetUsed } = rosterData;

	try {
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

		const uniqueDrivers = new Set(driverIds.map((id) => id.toString()));
		if (uniqueDrivers.size !== driverIds.length) {
			throw new Error("Duplicate drivers are not allowed");
		}

		const [budgetValidation, categoryValidation, calculatedBudget] =
			await Promise.all([
				validateUserBudget(rosterData, year),
				validateDriverCategories(driverIds, year),
				calculateDriversBudget(driverIds, year),
			]);

		const errors = [];

		if (!budgetValidation.isValid) {
			errors.push(
				`Budget exceeded by £${budgetValidation.exceedsBy.toFixed(2)}`
			);
		}

		if (!categoryValidation.isValid) {
			errors.push(
				`Missing required categories: ${categoryValidation.missingCategories.join(
					", "
				)}`
			);
		}

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
	updateUserBudget,
	restoreUserBudget,
	handleBudgetUpdate,
	isValidObjectId,
};
