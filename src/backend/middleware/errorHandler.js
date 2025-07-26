const chalk = require("chalk");

/**
 * @class AppError
 * @extends Error
 * @brief Custom error class for handling operational errors in the app.
 *
 * @param {string} message - The error message.
 * @param {number} statusCode - HTTP status code associated with the error.
 * @param {boolean} [isOperational=true] - Flag to indicate if the error is operational (trusted).
 */
class AppError extends Error {
	constructor(message, statusCode, isOperational = true) {
		super(message);
		this.statusCode = statusCode;
		this.isOperational = isOperational;
		this.status = `${statusCode}`.startsWith(`4`) ? "fail" : "error";

		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * @brief Handles MongoDB CastError (invalid ObjectId or other type errors).
 *
 * @param {Object} err - The error object.
 * @return {AppError} A new AppError with a formatted message and 400 status.
 */
const handleCastErrorDB = (err) => {
	const message = `Invalid ${err.path}: ${err.value}`;
	return new AppError(message, 400);
};

/**
 * @brief Handles MongoDB duplicate key error (E11000).
 *
 * @param {Object} err - The error object.
 * @return {AppError} A new AppError with a formatted message and 409 status.
 */
const handleDuplicateFieldsDB = (err) => {
	const field = Object.keys(err.keyValue)[0];
	const value = err.keyValue[field];
	const message = `${field} '${value}' already exists. Please use another one.`;
	return new AppError(message, 409);
};

/**
 * @brief Handles MongoDB validation errors.
 *
 * @param {Object} err - The error object.
 * @return {AppError} A new AppError with aggregated validation messages and 400 status.
 */
const handleValidationErrorDB = (err) => {
	const errors = Object.values(err.errors).map((el) => el.message);
	const message = `Invalid input data: ${errors.join(". ")}`;
	return new AppError(message, 400);
};

/**
 * @brief Returns a new AppError for JWT invalid token error.
 *
 * @return {AppError} The error indicating an invalid JWT.
 */
const handleJWTError = () =>
	new AppError("Invalid token. Please log in again.", 401);

/**
 * @brief Returns a new AppError for JWT expired token error.
 *
 * @return {AppError} The error indicating the JWT token has expired.
 */
const handleJWTExpiredError = () =>
	new AppError("Your token has expired. Please log in again.", 401);

/**
 * @brief Sends detailed error information during development.
 *
 * @param {Error} err - The error object.
 * @param {Object} res - Express response object.
 * @return {void}
 */
const sendErrorDev = (err, res) => {
	console.error(chalk.red("ERROR DETAILS:"), {
		status: err.status,
		error: err,
		message: err.message,
		stack: err.stack,
	});

	res.status(err.statusCode).json({
		success: false,
		status: err.status,
		error: err,
		message: err.message,
		stack: err.stack,
	});
};

/**
 * @brief Sends sanitized error information in production.
 *
 * @param {Error} err - The error object.
 * @param {Object} res - Express response object.
 * @return {void}
 */
const sendErrorProd = (err, res) => {
	if (err.isOperational) {
		res.status(err.statusCode).json({
			success: false,
			status: err.status,
			message: err.message,
		});
	} else {
		console.error(chalk.red("ERROR: "), err);

		res.status(500).json({
			success: false,
			status: "error",
			message: "Something went wrong!",
		});
	}
};

/**
 * @brief Global error handling middleware for Express.
 *
 * Differentiates between development and production environments,
 * and transforms known errors to operational AppErrors.
 *
 * @param {Error} err - The error object.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 *
 * @return {void}
 */
const globalErrorHandler = (err, req, res, next) => {
	err.statusCode = err.statusCode || 500;
	err.status = err.status || "error";

	if (process.env.NODE_ENV == "development") {
		sendErrorDev(err, res);
	} else {
		let error = Object.create(err);
		error.message = err.message;

		if (error.name === "CastError") error = handleCastErrorDB(error);
		if (error.code === 11000) error = handleDuplicateFieldsDB(error);
		if (error.name === "ValidationError")
			error = handleValidationErrorDB(error);
		if (error.name === "JsonWebTokenError") error = handleJWTError();
		if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

		sendErrorProd(error, res);
	}
};

/**
 * @brief Wrapper function to catch errors in async route handlers and pass them to next middleware.
 *
 * @param {Function} fn - The async function to wrap.
 * @return {Function} A new function wrapping the async function with error catching.
 */
const catchAsync = (fn) => {
	return (req, res, next) => {
		fn(req, res, next).catch(next);
	};
};

module.exports = {
	AppError,
	globalErrorHandler,
	catchAsync,
};
