const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/user');

const {
    elevationValidation,
    createUserValidation,
    updateUserValidation,
    mongoIdValidation,
    checkElevationConfig,
    handleValidationErrors
} = require('../middleware/validation');
const { genToken, authenticateToken, checkElevated } = require('../middleware/auth');
const { checkRole } = require('../middleware/rbac');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { body } = require('express-validator');

const router = express.Router();

const elevationLimiter = require('express-rate-limit')({
    max: 5, // Only 5 elevation attempts per window
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: {
        success: false,
        error: 'Too many elevation attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Elevate user
router.post('/elevate',
    elevationLimiter,
    authenticateToken,
    checkRole('admin'),
    checkElevationConfig,
    elevationValidation,
    catchAsync(async (req, res) => {
        const { elevationKey } = req.body;

        const providedKey = Buffer.from(elevationKey, 'utf-8');
        const secretKey = Buffer.from(process.env.ELEVATION_SECRET, 'utf-8');

        if (providedKey.length !== secretKey.length ||
            !require('crypto').timingSafeEqual(providedKey, secretKey)) {
            throw new AppError('Invalid elevation key', 403);
        }

        const elevatedToken = genToken(req.user._id, '15m', true);

        res.status(200).json({
            success: true,
            message: 'Elevation successfully',
            token: elevatedToken,
            expiresIn: '15 minutes'
        });
    })
);

// Get user statistics
router.get('/stats',
    authenticateToken,
    checkRole('admin'),
    catchAsync(async (req, res) => {
        const [
            totalUsers,
            adminUsers,
            regularUsers,
            totalBudget
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ role: 'admin' }),
            User.countDocuments({ role: 'user' }),
            User.aggregate([
                { $group: { _id: null, total: { $sum: '$budget' } } }
            ])
        ]);

        res.status(200).json({
            success: true,
            stats: {
                users: {
                    total: totalUsers,
                    admins: adminUsers,
                    regular: regularUsers
                },
                budget: {
                    total: totalBudget[0]?.total || 0
                }
            }
        });
    })
);

// Get user by id
router.get('/:id',
    authenticateToken,
    checkRole('admin'),
    mongoIdValidation(),
    catchAsync(async (req, res) => {
        const user = await User.findById(req.params.id, '-pin');

        if (!user) {
            throw new AppError('User not found', 404);
        }

        res.status(200).json({
            success: true,
            user
        });
    })
);

// Create a new user
router.post('/users',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    createUserValidation,
    catchAsync(async (req, res) => {
        const { username, pin, role = 'user', budget = 0} = req.body;

        const existingUser = await User.findOne({
            username: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (existingUser) {
            throw new AppError('A user with this username already exists', 409);
        }

        const hashedPin = await bcrypt.hash(pin, 12);

        const newUser = new User({
            username: username.trim(),
            pin: hashedPin,
            role,
            budget
        });

        await newUser.save();

        const userResponse = {
            id: newUser._id,
            username: newUser.username,
            role: newUser.role,
            budget: newUser.role
        };

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: userResponse
        });
    })
);

// Update a current user
router.put('/:id',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    mongoIdValidation(),
    updateUserValidation,
    catchAsync(async (req, res) => {
        const userId = req.params.id;
        const updates = req.body;

        const allowedUpdates = ['username', 'pin', 'budget'];
        const actualUpdates = Object.keys(updates).filter(key => allowedUpdates.includes(key));

        if (actualUpdates.length == 0) {
            throw new AppError('No valid fields provided for update', 400);
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Check username uniqueness
        if (updates.username && updates.username !== user.username) {
            const existingUser = await User.findOne({
                username: { $regex: new RegExp(`^${updates.username}$`, 'i') },
                _id: { $ne: userId }
            });

            if (existingUser) {
                throw new AppError('Username already exists', 409);
            }
        }

        if (updates.pin) {
            updates.pin = await bcrypt.hash(updates.pin, 12);
        }

        const filteredUpdates = {};
        for (const key of actualUpdates) {
            if (key === 'pin') {
                filteredUpdates.pin = await bcrypt.hash(updates.pin, 12);
            } else {
                filteredUpdates[key] = updates[key];
            }
        }


        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: filteredUpdates },
            { new: true, runValidators: true }
        ).select('-pin');

        res.status(200).json({
            success: true,
            message: 'User was updated successfully',
            user: updatedUser
        });
    })
);


// Delete a current user
router.delete('/:id',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    mongoIdValidation(),
    catchAsync(async (req, res) => {
        const userIdToDelete = req.params.id;
        const requestingUserId = req.user._id.toString();

        if (userIdToDelete === requestingUserId) {
            throw new AppError('You cannot delete your own account', 400);
        }

        const userToDelete = await User.findById(userIdToDelete);
        if (!userToDelete) {
            throw new AppError('User not found', 404);
        }

        if (userToDelete.role == 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                throw new AppError('Cannot delete the last admin user', 400);
            }
        }

        await User.findByIdAndDelete(userIdToDelete);

        res.status(200).json({
            success: true,
            message: 'User deleted successfully',
            deletedUser: {
                id: userToDelete._id,
                username: userToDelete.username
            }
        });
    })
);

// Reset a pin of a current user
router.post('/:id/reset-pin',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    mongoIdValidation,
    [
        body('newPin')
            .notEmpty()
            .withMessage('New PIN is required')
            .isLength({ min: 4, max: 4 })
            .withMessage('PIN must be exactly 4 digits')
            .isNumeric()
            .withMessage('PIN must contain only numbers'),
        handleValidationErrors
    ],
    catchAsync(async (req, res) => {
        const { newPin } = req.body;
        const userId = req.params.id;

        const user = await User.findById(userId);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        const hashedPin = await bcrypt.hash(newPin, 12);
        await User.findByIdAndUpdate(userId, { pin: hashedPin });

        res.status(200).json({
            success: true,
            message: `PIN reset successfully for user ${user.username}`
        });
    })
)

module.exports = router;