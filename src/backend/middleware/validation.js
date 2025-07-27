const { body, validationResult, param } = require("express-validator");
const { AppError } = require("./errorHandler");
const mongoose = require("mongoose");
const { validateYear } = require("../models/modelPerYear");

const handleValidationErrors = (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		const errorMessages = errors
			.array()
			.map((error) => error.msg)
			.join(". ");
		return next(new AppError(errorMessages, 400));
	}
	next();
};

const pinValidation = body("pin")
	.notEmpty()
	.withMessage("PIN is required")
	.isLength({ min: 4, max: 4 })
	.withMessage("PIN must be exactly 4 digits")
	.isInt()
	.withMessage("PIN must contain only numbers");

const validateYearValue = (value) => {
	if (!validateYear(value)) {
		throw new Error(
			`Invalid year: ${value}. Must be between 2000 and ${
				new Date().getFullYear() + 5
			}`
		);
	}
	return true;
};

const elevationValidation = [
	body("elevationKey")
		.notEmpty()
		.withMessage("Elevation key is required")
		.isLength({ min: 1 })
		.withMessage("Elevation key cannot be empty"),
	handleValidationErrors,
];

const loginValidation = [
	body("username")
		.trim()
		.notEmpty()
		.withMessage("Username is required")
		.isLength({ min: 1, max: 50 })
		.withMessage("Username must be between 1 and 50 characters"),
	pinValidation,
	body("year")
		.optional()
		.matches(/^\d{4}$/)
		.withMessage("Year must be a 4-digit number")
		.custom(validateYearValue),
	handleValidationErrors,
];

const createUserValidation = [
	body("username")
		.trim()
		.notEmpty()
		.withMessage("Username is required")
		.isLength({ min: 2, max: 50 })
		.withMessage("Username must be between 2 and 50 characters")
		.matches(/^[a-zA-Z0-9_-]+$/)
		.withMessage(
			"Username can only contain letters, numbers, underscores, and hyphens"
		),
	pinValidation,
	body("role")
		.optional()
		.isIn(["admin", "user"])
		.withMessage('Role must be either "admin" or "user"'),
	body("budget")
		.optional()
		.isFloat({ min: 0 })
		.withMessage("Budget must be a non-negative number"),
	handleValidationErrors,
];

const updateUserValidation = [
	body("username")
		.optional()
		.trim()
		.isLength({ min: 2, max: 50 })
		.withMessage("Username must be between 2 and 50 characters")
		.matches(/^[a-zA-Z0-9_-]+$/)
		.withMessage(
			"Username can only contain letters, numbers, underscores, and hyphens"
		),
	body("pin")
		.optional()
		.isLength({ min: 4, max: 4 })
		.withMessage("PIN must be exactly 4 digits")
		.isInt()
		.withMessage("PIN must contain only numbers"),
	body("role")
		.optional()
		.isIn(["admin", "user"])
		.withMessage('Role must be either "admin" or "user"'),
	body("budget")
		.optional()
		.isFloat({ min: 0 })
		.withMessage("Budget must be a non-negative number"),
	handleValidationErrors,
];

const createDriverValidation = [
	body("name")
		.trim()
		.notEmpty()
		.withMessage("Name is required")
		.isLength({ min: 2, max: 50 })
		.withMessage("Name must be between 2 and 50 characters"),
	body("value")
		.notEmpty()
		.withMessage("Value is required")
		.isNumeric()
		.withMessage("Value must be a number"),
	body("categories")
		.isArray({ min: 1, max: 2 })
		.withMessage("Categories must be an array with 1 or 2 items"),
	body("categories.*")
		.isIn(["M", "JS", "I"])
		.withMessage("Each category must be one of: M, JS, I"),
	handleValidationErrors,
];

const updateDriverValidation = [
	body("name")
		.optional()
		.trim()
		.isLength({ min: 2, max: 50 })
		.withMessage("Name must be between 2 and 50 characters")
		.matches(/^[a-zA-Z\s]+$/)
		.withMessage("Name can only contain letters and spaces"),
	body("value")
		.optional()
		.isInt({ min: 0 })
		.withMessage("Value must be a non-negative integer"),
	body("categories")
		.optional()
		.isArray({ min: 1, max: 2 })
		.withMessage("Categories must be an array with 1 or 2 items"),
	body("categories.*")
		.optional()
		.isIn(["M", "JS", "I"])
		.withMessage("Each category must be one of: M, JS, I"),
	handleValidationErrors,
];

const createRosterValidation = [
	body("user")
		.notEmpty()
		.withMessage("User ID is required")
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage("User ID must be a valid MongoDB ObjectId"),
	body("drivers")
		.isArray({ min: 1 })
		.withMessage("Drivers must be a non-empty array"),
	body("drivers.*")
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage("Each driver ID must be a valid MongoDB ObjectId"),
	body("budgetUsed")
		.isFloat({ min: 0 })
		.withMessage("Budget used must be a number greater than or equal to 0"),
	body("pointsEarned")
		.isNumeric()
		.withMessage("Points earned must be a number"),
	body("race")
		.notEmpty()
		.withMessage("Race ID is required")
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage("Race ID must be a valid MongoDB ObjectId"),
	handleValidationErrors,
];

const updateRosterValidation = [
	body("user")
		.optional()
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage("User ID must be a valid MongoDB ObjectId"),
	body("drivers")
		.optional()
		.isArray({ min: 1 })
		.withMessage("Drivers must be a non-empty array"),
	body("budgetUsed")
		.optional()
		.isFloat({ min: 0 })
		.withMessage("Budget used must be a number greater than or equal to 0"),
	body("pointsEarned")
		.optional()
		.isNumeric()
		.withMessage("Points earned must be a number"),
	body("race")
		.optional()
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage("Race ID must be a valid MongoDB ObjectId"),
	handleValidationErrors,
];

const ppmCalculationValidation = [
	body("raceId")
		.notEmpty()
		.withMessage("Race ID is required")
		.isMongoId()
		.withMessage("Race ID must be a valid MongoDB ObjectId"),
	body("totalMeetingPoints")
		.isNumeric()
		.withMessage("Total meeting points must be a number")
		.isFloat({ min: 0 })
		.withMessage("Total meeting points must be non-negative"),
	body("venuePoints")
		.optional()
		.isNumeric()
		.withMessage("Venue points must be a number")
		.isFloat({ min: 0 })
		.withMessage("Venue points must be non-negative"),
	body("driverResults")
		.optional()
		.isArray()
		.withMessage("Driver results must be an array"),
	body("driverResults.*.driverId")
		.optional()
		.isMongoId()
		.withMessage("Each driver ID must be a valid MongoDB ObjectId"),
	body("driverResults.*.pointsGained")
		.optional()
		.isNumeric()
		.withMessage("Points gained must be a number")
		.isFloat({ min: 0 })
		.withMessage("Points gained must be non-negative"),
	handleValidationErrors,
];

const mongoIdValidation = (paramName = "id") => {
	return (req, res, next) => {
		const id = req.params[paramName];
		if (!mongoose.Types.ObjectId.isValid(id)) {
			const route = req.originalUrl || req.url;
			return next(
				new AppError(
					`Invalid MongoID in param "${paramName}" with value "${id}" on route "${route}"`,
					400
				)
			);
		}
		next();
	};
};

const yearValidation = [
	param("year")
		.matches(/^\d{4}$/)
		.withMessage("Year must be a 4-digit number")
		.custom(validateYearValue),
	handleValidationErrors,
];

const copyYearValidation = [
	body("sourceYear")
		.matches(/^\d{4}$/)
		.withMessage("Source year must be a 4-digit number")
		.custom(validateYearValue),
	body("targetYear")
		.matches(/^\d{4}$/)
		.withMessage("Target year must be a 4-digit number")
		.custom(validateYearValue),
	body("collections")
		.optional()
		.isArray()
		.withMessage("Collections must be an array")
		.custom((value) => {
			const validCollections = ["drivers", "users", "races"];
			const invalidCollections = value.filter(
				(col) => !validCollections.includes(col)
			);
			if (invalidCollections.length > 0) {
				throw new Error(
					`Invalid collections: ${invalidCollections.join(
						", "
					)}. Valid options: ${validCollections.join(", ")}`
				);
			}
			return true;
		}),
	handleValidationErrors,
];

const requireElevationSecret = (req, res, next) => {
	if (!process.env.ELEVATION_SECRET) {
		return next(new AppError("Elevation secret is not configured", 401));
	}
	next();
};

module.exports = {
	handleValidationErrors,
	pinValidation,
	validateYearValue,
	elevationValidation,
	loginValidation,
	createUserValidation,
	updateUserValidation,
	createDriverValidation,
	updateDriverValidation,
	createRosterValidation,
	updateRosterValidation,
	ppmCalculationValidation,
	mongoIdValidation,
	yearValidation,
	copyYearValidation,
	requireElevationSecret,
};
