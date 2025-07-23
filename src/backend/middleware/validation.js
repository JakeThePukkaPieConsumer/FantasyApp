const { body, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');
const mongoose = require('mongoose');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => error.msg).join('. ');
        return next(new AppError(errorMessages, 400));
    }
    next();
};

const elevationValidation = [
    body('elevationKey')
        .notEmpty()
        .withMessage('Elevation key is required')
        .isLength({ min: 1 })
        .withMessage('Elevation key cannot be empty'),
    handleValidationErrors
];

const loginValidation = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 1, max: 50 })
        .withMessage('Username must be between 1 and 50 characters'),
    body('pin')
        .notEmpty()
        .withMessage('PIN is required')
        .isLength({ min: 4, max: 4 })
        .withMessage('PIN must be exactly 4 numbers')
        .isNumeric()
        .withMessage('PIN must contain only numbers'),
    handleValidationErrors
];

const createUserValidation = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Username must be between 2 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('pin')
        .notEmpty()
        .withMessage('PIN is required')
        .isLength({ min: 4, max: 4 })
        .withMessage('PIN must be exactly 4 digits')
        .isNumeric()
        .withMessage('PIN must contain only numbers'),
    body('role')
        .optional()
        .isIn(['admin', 'user'])
        .withMessage('Role must be either "admin" or "user"'),
    body('budget')
        .optional()
        .isNumeric()
        .withMessage('Budget must be a number')
        .isFloat({ min: 0 })
        .withMessage('Budget cannot be negative'),
    handleValidationErrors
];

const updateUserValidation = [
    body('username')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Username must be between 2 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('pin')
        .optional()
        .isLength({ min: 4, max: 4 })
        .withMessage('PIN must be exactly 4 digits')
        .isNumeric()
        .withMessage('PIN must contain only numbers'),
    body('role')
        .optional()
        .isIn(['admin', 'user'])
        .withMessage('Role must be either "admin" or "user"'),
    body('budget')
        .optional()
        .isNumeric()
        .withMessage('Budget must be a number')
        .isFloat({ min: 0 })
        .withMessage('Budget cannot be negative'),
    handleValidationErrors
];

const createDriverValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters'),
    body('value')
        .notEmpty()
        .withMessage('Value is required')
        .isNumeric()
        .withMessage('Value must contain only numbers'),
    body('categories')
        .isArray({ min: 1, max: 2 })
        .withMessage('Categories must be an array with 1 or 2 items'),
    body('categories.*')
        .isIn(['M', 'JS', 'I'])
        .withMessage('Each category must be one of: M, JS, I'),
    handleValidationErrors
];

const updateDriverValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/) // allow letters and spaces only
        .withMessage('Name can only contain letters and spaces'),
    body('value')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Value must be a non-negative integer'),
    body('categories')
        .optional()
        .isArray({ min: 1, max: 2 })
        .withMessage('Categories must be an array with 1 or 2 items'),
    body('categories.*')
        .optional()
        .isIn(['M', 'JS', 'I'])
        .withMessage('Each category must be one of: M, JS, I'),
    handleValidationErrors
];

const mongoIdValidation = (paramName = 'id') => {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError('Invalid user ID format', 400));
        }
        next();
    };
};

const checkElevationConfig = (req, res, next) => {
    if (!process.env.ELEVATION_SECRET) {
        return next(new AppError('Elevation system not configured', 500));
    }
    next();
};

module.exports = {
    elevationValidation,
    createUserValidation,
    updateUserValidation,
    mongoIdValidation,
    checkElevationConfig,
    handleValidationErrors,
    loginValidation,
    createDriverValidation,
    updateDriverValidation
};