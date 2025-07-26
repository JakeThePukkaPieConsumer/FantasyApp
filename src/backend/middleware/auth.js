const jwt = require("jsonwebtoken");
const { getUserModelForYear, validateYear } = require("../models/modelPerYear");
const { AppError, catchAsync } = require("./errorHandler");

/**
 * @brief Gets the current active year as a string.
 *
 * @return {string} The current year (e.g., "2025").
 */
const getCurrentActiveYear = () => {
	return new Date().getFullYear().toString();
};

/**
 * @brief Generates a JWT token for a user.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} [expiresIn="14d"] - Token expiration time (e.g., "14d", "1h").
 * @param {boolean} [isElevated=false] - Flag indicating if the token has elevated privileges.
 * @param {string|null} [year=null] - Optional year to include in the token payload; defaults to current active year.
 *
 * @throws {AppError} Throws error if JWT_SECRET environment variable is missing.
 *
 * @return {string} Signed JWT token.
 */
function genToken(userId, expiresIn = "14d", isElevated = false, year = null) {
	if (!process.env.JWT_SECRET) {
		throw new AppError(
			"JWT_SECRET is not defined in environment variables",
			500
		);
	}

	const payload = {
		userId,
		elevated: isElevated,
		year: year || getCurrentActiveYear(),
	};

	return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * @brief Middleware to authenticate requests using JWT tokens.
 *
 * This middleware checks for a JWT in the Authorization header,
 * verifies it, validates the year, and loads the user from the database.
 * If successful, attaches the user and userYear to the request object.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 *
 * @return {void}
 *
 * @throws {AppError} Throws an error if token is missing, invalid, expired, or if user doesn't exist.
 */
const authenticateToken = catchAsync(async (req, res, next) => {
	const authHeader = req.headers["authorization"];
	const token = authHeader && authHeader.split(" ")[1];

	if (!token) {
		return next(new AppError("Access token required", 401));
	}

	if (!process.env.JWT_SECRET) {
		return next(new AppError("JWT configuration error", 500));
	}

	const decoded = jwt.verify(token, process.env.JWT_SECRET);

	const userYear = decoded.year || getCurrentActiveYear();

	if (!validateYear(userYear)) {
		return next(new AppError("Invalid year in token", 401));
	}

	const User = getUserModelForYear(userYear);
	const user = await User.findById(decoded.userId);

	if (!user) {
		return next(
			new AppError(
				"The user belonging to this token no longer exists",
				401
			)
		);
	}

	req.user = user;
	req.userYear = userYear;
	next();
});

/**
 * @brief Middleware to check for elevated privileges in the JWT token.
 *
 * This middleware validates the presence of an elevated token and
 * verifies that the token has the elevated flag set to true.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 *
 * @return {void}
 *
 * @throws {AppError} Throws an error if token is missing, invalid, or lacks elevated privileges.
 */
const checkElevated = catchAsync(async (req, res, next) => {
	const authHeader = req.headers["authorization"];
	const token = authHeader && authHeader.split(" ")[1];

	if (!token) {
		return next(new AppError("Elevated token required", 401));
	}

	if (!process.env.JWT_SECRET) {
		return next(new AppError("JWT configuration error", 500));
	}

	const decoded = jwt.verify(token, process.env.JWT_SECRET);

	if (!decoded.elevated) {
		return next(new AppError("Elevated privileges required", 403));
	}

	const userYear = decoded.year || getCurrentActiveYear();

	if (!validateYear(userYear)) {
		return next(new AppError("Invalid year in token", 401));
	}

	req.userId = decoded.userId;
	req.userYear = userYear;
	next();
});

module.exports = {
	genToken,
	authenticateToken,
	checkElevated,
	getCurrentActiveYear,
};
