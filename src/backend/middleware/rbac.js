const { AppError } = require("./errorHandler");

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
