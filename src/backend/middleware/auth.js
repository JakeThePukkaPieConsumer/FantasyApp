const jwt = require("jsonwebtoken");
const { getUserModelForYear, validateYear } = require("../models/modelPerYear");
const { AppError, catchAsync } = require("./errorHandler");

const getCurrentActiveYear = () => new Date().getFullYear().toString();

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

const authenticateToken = catchAsync(async (req, res, next) => {
	const authHeader = req.headers["authorization"];
	const token = authHeader && authHeader.split(" ")[1];

	if (!token) return next(new AppError("Access token required", 401));
	if (!process.env.JWT_SECRET)
		return next(new AppError("JWT configuration error", 500));

	const decoded = jwt.verify(token, process.env.JWT_SECRET);
	const userYear = decoded.year || getCurrentActiveYear();

	if (!validateYear(userYear))
		return next(new AppError("Invalid year in token", 401));

	const User = getUserModelForYear(userYear);
	const user = await User.findById(decoded.userId);

	if (!user)
		return next(
			new AppError(
				"The user belonging to this token no longer exists",
				401
			)
		);

	req.user = user;
	req.userYear = userYear;
	next();
});

const checkElevated = catchAsync(async (req, res, next) => {
	const authHeader = req.headers["authorization"];
	const token = authHeader && authHeader.split(" ")[1];

	if (!token) return next(new AppError("Elevated token required", 401));
	if (!process.env.JWT_SECRET)
		return next(new AppError("JWT configuration error", 500));

	const decoded = jwt.verify(token, process.env.JWT_SECRET);

	if (!decoded.elevated)
		return next(new AppError("Elevated privileges required", 403));

	const userYear = decoded.year || getCurrentActiveYear();

	if (!validateYear(userYear))
		return next(new AppError("Invalid year in token", 401));

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
