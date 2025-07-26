const express = require("express");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const {
	getUserModelForYear,
	validateYear,
	getAvailableYears,
} = require("../models/modelPerYear");
const { genToken, authenticateToken } = require("../middleware/auth");
const { loginValidation, yearValidation } = require("../middleware/validation");
const { AppError, catchAsync } = require("../middleware/errorHandler");

const router = express.Router();

/**
 * @function getCurrentActiveYear
 * @description Get current year as string, used as default for user operations.
 * @returns {string} Current year (e.g. "2025")
 */
const getCurrentActiveYear = () => {
	return new Date().getFullYear().toString();
};

/**
 * @route GET /
 * @description Retrieve all users for the current active year, excluding PIN.
 * @access Public
 * @returns {Object} JSON with success, message, year, count, users array
 */
router.get(
	"/",
	catchAsync(async (req, res) => {
		const currentYear = getCurrentActiveYear();
		const User = getUserModelForYear(currentYear);

		const users = await User.find({}, { pin: 0 }).sort({ username: 1 });
		res.status(200).json({
			success: true,
			message: `Current active users (${currentYear})`,
			year: parseInt(currentYear, 10),
			count: users.length,
			users,
		});
	})
);

/**
 * @route GET /verify
 * @description Verify JWT token and return user info (without PIN).
 * @access Protected
 * @returns {Object} JSON with success and user info
 */
router.get("/verify", authenticateToken, (req, res) => {
	const { _id, username, role, budget, points } = req.user;

	res.status(200).json({
		success: true,
		user: {
			id: _id,
			username,
			role,
			budget,
			points,
		},
	});
});

/**
 * @route GET /years
 * @description Get list of available years and user counts per year.
 * @access Protected
 * @returns {Object} JSON with success, current year stats, and historical data
 */
router.get(
	"/years",
	authenticateToken,
	catchAsync(async (req, res) => {
		const years = await getAvailableYears();

		const yearStats = await Promise.all(
			years.map(async (year) => {
				try {
					const UserYear = getUserModelForYear(year);
					const count = await UserYear.countDocuments();
					return { year, userCount: count };
				} catch (error) {
					return { year, userCount: 0, error: error.message };
				}
			})
		);

		const currentYear = getCurrentActiveYear();
		const currentUserModel = getUserModelForYear(currentYear);
		const currentUserCount = await currentUserModel.countDocuments();

		res.status(200).json({
			success: true,
			message: "Available years with user data",
			current: {
				year: parseInt(currentYear, 10),
				userCount: currentUserCount,
				collection: `users_${currentYear}`,
			},
			historical: yearStats.filter((y) => y.userCount > 0),
		});
	})
);

/**
 * @route GET /:year
 * @description Retrieve users for a specified year, filtered by optional role and sorted.
 * @param {string} year - Year to query
 * @query {string} [role] - Filter by role ('admin' or 'user')
 * @query {string} [sort] - Field to sort by (username, role, budget, points)
 * @query {string} [order] - Sort order ('asc' or 'desc')
 * @access Public
 * @returns {Object} JSON with success, year, message, count, and users
 */
router.get(
	"/:year",
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const UserYear = getUserModelForYear(year);

		const { role, sort = "username", order = "asc" } = req.query;

		const query = {};
		if (role && ["admin", "user"].includes(role)) {
			query.role = role;
		}

		const sortOrder = order === "desc" ? -1 : 1;
		const sortOptions = {};
		if (["username", "role", "budget", "points"].includes(sort)) {
			sortOptions[sort] = sortOrder;
		} else {
			sortOptions.username = 1;
		}

		const users = await UserYear.find(query, { pin: 0 }).sort(sortOptions);

		res.status(200).json({
			success: true,
			year: parseInt(year, 10),
			message: `Users from ${year} season`,
			count: users.length,
			users,
		});
	})
);

/**
 * @route GET /:year/stats
 * @description Get aggregate user statistics (counts, budget, points) for a given year.
 * @param {string} year - Year to get stats for
 * @access Protected
 * @returns {Object} JSON with success, year, and stats object
 */
router.get(
	"/:year/stats",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const year = req.params.year;
		const UserYear = getUserModelForYear(year);

		const [
			totalUsers,
			adminCount,
			regularUserCount,
			totalBudgetAgg,
			totalPointsAgg,
			avgBudgetAgg,
			avgPointsAgg,
		] = await Promise.all([
			UserYear.countDocuments(),
			UserYear.countDocuments({ role: "admin" }),
			UserYear.countDocuments({ role: "user" }),
			UserYear.aggregate([
				{ $group: { _id: null, total: { $sum: "$budget" } } },
			]),
			UserYear.aggregate([
				{ $group: { _id: null, total: { $sum: "$points" } } },
			]),
			UserYear.aggregate([
				{ $group: { _id: null, avg: { $avg: "$budget" } } },
			]),
			UserYear.aggregate([
				{ $group: { _id: null, avg: { $avg: "$points" } } },
			]),
		]);

		res.status(200).json({
			success: true,
			year: parseInt(year, 10),
			stats: {
				users: {
					total: totalUsers,
					admins: adminCount,
					regular: regularUserCount,
				},
				budget: {
					total: totalBudgetAgg[0]?.total || 0,
					average: avgBudgetAgg[0]?.avg || 0,
				},
				points: {
					total: totalPointsAgg[0]?.total || 0,
					average: avgPointsAgg[0]?.avg || 0,
				},
			},
		});
	})
);

/**
 * @route GET /:year/:id
 * @description Retrieve a single user by ID for a specified year.
 * @param {string} year - Year to query
 * @param {string} id - User ID (MongoDB ObjectId)
 * @access Protected
 * @returns {Object} JSON with success, year, and user object
 * @throws {AppError} 400 if invalid ID format, 404 if user not found
 */
router.get(
	"/:year/:id",
	authenticateToken,
	yearValidation,
	catchAsync(async (req, res) => {
		const { year, id } = req.params;
		const UserYear = getUserModelForYear(year);

		if (!mongoose.Types.ObjectId.isValid(id)) {
			throw new AppError("Invalid user ID format", 400);
		}

		const user = await UserYear.findById(id, { pin: 0 });

		if (!user) {
			throw new AppError("User not found", 404);
		}

		res.status(200).json({
			success: true,
			year: parseInt(year, 10),
			user,
		});
	})
);

/**
 * @route POST /login
 * @description Authenticate user with username, pin, and optional year. Returns JWT token.
 * @body {string} username - Username of the user
 * @body {string} pin - User's PIN (password)
 * @body {string} [year] - Year to login (defaults to current year)
 * @access Public
 * @returns {Object} JSON with success, message, token, year, and user info (without pin)
 * @throws {AppError} 400 if invalid year, 401 if credentials invalid
 */
router.post(
	"/login",
	loginValidation,
	catchAsync(async (req, res, next) => {
		const { username, pin, year } = req.body;

		const loginYear = year || getCurrentActiveYear();

		if (!validateYear(loginYear)) {
			return next(new AppError("Invalid year provided", 400));
		}

		const User = getUserModelForYear(loginYear);
		const user = await User.findOne({ username }).select("+pin");

		if (!user) {
			return next(new AppError("Invalid credentials", 401));
		}

		const valid = await bcrypt.compare(pin, user.pin);
		if (!valid) {
			return next(new AppError("Invalid credentials", 401));
		}

		const token = genToken(user._id, "14d", false, loginYear);

		res.status(200).json({
			success: true,
			message: "Login successful",
			token,
			year: parseInt(loginYear, 10),
			user: {
				id: user._id,
				username: user.username,
				role: user.role,
				budget: user.budget,
				points: user.points,
			},
		});
	})
);

/**
 * @route GET /search/:query
 * @description Search users by username across specified or recent years, limited results.
 * @param {string} query - Search query (min 2 characters)
 * @query {string} [year] - Optional year to restrict search
 * @access Protected
 * @returns {Object} JSON with success, original query, and array of results grouped by year
 * @throws {AppError} 400 if query is too short
 */
router.get(
	"/search/:query",
	authenticateToken,
	catchAsync(async (req, res) => {
		const searchQuery = req.params.query.trim();
		const { year } = req.query;

		if (!searchQuery || searchQuery.length < 2) {
			throw new AppError(
				"Search query must be at least 2 characters",
				400
			);
		}

		const searchRegex = new RegExp(searchQuery, "i");
		const results = [];

		if (year && validateYear(year)) {
			const UserYear = getUserModelForYear(year);
			const users = await UserYear.find(
				{ username: searchRegex },
				{ pin: 0 }
			).limit(10);

			results.push({
				year: parseInt(year, 10),
				users: users.map((user) => ({
					...user.toObject(),
					collection: `users_${year}`,
				})),
			});
		} else {
			const currentYear = getCurrentActiveYear();
			const CurrentUser = getUserModelForYear(currentYear);
			const currentUsers = await CurrentUser.find(
				{ username: searchRegex },
				{ pin: 0 }
			).limit(10);

			if (currentUsers.length > 0) {
				results.push({
					year: parseInt(currentYear, 10),
					users: currentUsers.map((user) => ({
						...user.toObject(),
						collection: `users_${currentYear}`,
					})),
				});
			}

			const years = await getAvailableYears();
			const otherYears = years.filter(
				(yr) => yr.toString() !== currentYear
			);

			// Search older years if no or few results found
			for (const y of otherYears) {
				if (results.length >= 3) break; // Limit results to top 3 years

				const UserYear = getUserModelForYear(y);
				const users = await UserYear.find(
					{ username: searchRegex },
					{ pin: 0 }
				).limit(5);

				if (users.length > 0) {
					results.push({
						year: parseInt(y, 10),
						users: users.map((user) => ({
							...user.toObject(),
							collection: `users_${y}`,
						})),
					});
				}
			}
		}

		res.status(200).json({
			success: true,
			query: searchQuery,
			results,
		});
	})
);

module.exports = router;
