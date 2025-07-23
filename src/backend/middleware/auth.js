const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { AppError, catchAsync } = require('./errorHandler');

function genToken(userId, expiresIn = '14d', isElevated = false) {
    if (!process.env.JWT_SECRET) {
        throw new AppError('JWT_SECRET is not defined in environment variables', 500);
    }
    
    return jwt.sign(
        { userId, elevated: isElevated },
        process.env.JWT_SECRET,
        { expiresIn }
    );
}

const authenticateToken = catchAsync(async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next(new AppError('Access token required', 401));
    }

    if (!process.env.JWT_SECRET) {
        return next(new AppError('JWT configuration error', 500));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
        return next(new AppError('The user belonging to this token no longer exists', 401));
    }

    req.user = user;
    next();
});

const checkElevated = catchAsync(async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return next(new AppError('Elevated token required', 401));
    }

    if (!process.env.JWT_SECRET) {
        return next(new AppError('JWT configuration error', 500));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.elevated) {
        return next(new AppError('Elevated privileges required', 403));
    }

    req.userId = decoded.userId;
    next();
});

module.exports = { genToken, authenticateToken, checkElevated };