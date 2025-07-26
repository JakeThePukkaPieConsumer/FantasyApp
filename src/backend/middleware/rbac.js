const { AppError } = require("./errorHandler");

/**
 * @brief Middleware to check if the logged-in user has the required role.
 * 
 * @param {string} requiredRole - The role required to access the route.
 * @return {Function} Express middleware function that validates user role.
 * 
 * @throws {AppError} Throws 401 if no user is logged in.
 * @throws {AppError} Throws 403 if user's role does not match requiredRole.
 */
function checkRole(requiredRole) {
	return (req, res, next) => {
		const user = req.user;

		if (!user) {
			return next(new AppError("Unauthorized: No user logged in", 401));
		}

		if (user.role !== requiredRole) {
			return next(
				new AppError(
					`Access denied: requires role '${requiredRole}'`,
					403
				)
			);
		}

		next();
	};
}

module.exports = { checkRole };
