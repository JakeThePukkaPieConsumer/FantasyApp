const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/userSchema');
const { getUserModelForYear, validateYear, getAvailableYears } = require('../models/modelPerYear');
const { genToken, authenticateToken } = require('../middleware/auth');
const { loginValidation, yearValidation } = require('../middleware/validation');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { param } = require('express-validator');
const router = express.Router();

// Get users from main collection (current active users)
router.get('/', 
    authenticateToken,
    catchAsync(async (req, res) => {
        const users = await User.find({}, { pin: 0 }).sort({ username: 1 });
        res.status(200).json({ 
            success: true, 
            message: 'Current active users',
            count: users.length,
            users 
        });
    })
);

// Get all available years with user data
router.get('/years',
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

        const mainUserCount = await User.countDocuments();
        const currentYear = new Date().getFullYear();
        
        res.status(200).json({
            success: true,
            message: 'Available years with user data',
            current: {
                year: currentYear,
                userCount: mainUserCount,
                collection: 'main'
            },
            historical: yearStats.filter(y => y.userCount > 0)
        });
    })
);

// Get users from specific year collection
router.get('/:year', 
    authenticateToken,
    yearValidation,
    catchAsync(async (req, res) => {
        const year = req.params.year;
        const UserYear = getUserModelForYear(year);

        const { role, sort = 'username', order = 'asc' } = req.query;
        
        let query = {};
        if (role && ['admin', 'user'].includes(role)) {
            query.role = role;
        }

        const sortOrder = order === 'desc' ? -1 : 1;
        const sortOptions = {};
        if (['username', 'role', 'budget', 'points'].includes(sort)) {
            sortOptions[sort] = sortOrder;
        } else {
            sortOptions.username = 1; 
        }

        const users = await UserYear.find(query, { pin: 0 }).sort(sortOptions);

        res.status(200).json({ 
            success: true,
            year: parseInt(year),
            message: `Users from ${year} season`,
            count: users.length,
            users 
        });
    })
);

// Get user statistics for a specific year
router.get('/:year/stats',
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
            avgPointsAgg
        ] = await Promise.all([
            UserYear.countDocuments(),
            UserYear.countDocuments({ role: 'admin' }),
            UserYear.countDocuments({ role: 'user' }),
            UserYear.aggregate([{ $group: { _id: null, total: { $sum: '$budget' } } }]),
            UserYear.aggregate([{ $group: { _id: null, total: { $sum: '$points' } } }]),
            UserYear.aggregate([{ $group: { _id: null, avg: { $avg: '$budget' } } }]),
            UserYear.aggregate([{ $group: { _id: null, avg: { $avg: '$points' } } }])
        ]);

        res.status(200).json({
            success: true,
            year: parseInt(year),
            stats: {
                users: {
                    total: totalUsers,
                    admins: adminCount,
                    regular: regularUserCount
                },
                budget: {
                    total: totalBudgetAgg[0]?.total || 0,
                    average: avgBudgetAgg[0]?.avg || 0
                },
                points: {
                    total: totalPointsAgg[0]?.total || 0,
                    average: avgPointsAgg[0]?.avg || 0
                }
            }
        });
    })
);

// Get single user from specific year
router.get('/:year/:id',
    authenticateToken,
    yearValidation,
    catchAsync(async (req, res) => {
        const { year, id } = req.params;
        const UserYear = getUserModelForYear(year);
        
        if (!require('mongoose').Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user ID format', 400);
        }
        
        const user = await UserYear.findById(id, { pin: 0 });
        
        if (!user) {
            throw new AppError('User not found', 404);
        }
        
        res.status(200).json({
            success: true,
            year: parseInt(year),
            user
        });
    })
);

// Login endpoint (uses main User collection)
router.post('/login', 
    loginValidation, 
    catchAsync(async (req, res, next) => {
        const { username, pin } = req.body;

        const user = await User.findOne({ username }).select('+pin');
        if (!user) {
            return next(new AppError('Invalid credentials', 401));
        }

        const valid = await bcrypt.compare(pin, user.pin);
        if (!valid) {
            return next(new AppError('Invalid credentials', 401));
        }

        const token = genToken(user._id);

        res.status(200).json({ 
            success: true,
            message: 'Login successful', 
            token,
            user: { 
                id: user._id,
                username: user.username, 
                role: user.role,
                budget: user.budget,
                points: user.points
            } 
        });
    })
);

// Verify token endpoint
router.get('/verify', 
    authenticateToken, 
    (req, res) => {
        const { _id, username, role, budget, points } = req.user;

        res.status(200).json({ 
            success: true,
            user: { 
                id: _id,
                username, 
                role, 
                budget,
                points 
            } 
        });
    }
);

// Search users across years
router.get('/search/:query',
    authenticateToken,
    catchAsync(async (req, res) => {
        const searchQuery = req.params.query.trim();
        const { year } = req.query;
        
        if (!searchQuery || searchQuery.length < 2) {
            throw new AppError('Search query must be at least 2 characters', 400);
        }

        const searchRegex = new RegExp(searchQuery, 'i');
        const results = [];

        if (year && validateYear(year)) {
            // Search specific year
            const UserYear = getUserModelForYear(year);
            const users = await UserYear.find(
                { username: searchRegex },
                { pin: 0 }
            ).limit(10);
            
            results.push({
                year: parseInt(year),
                users: users.map(user => ({
                    ...user.toObject(),
                    collection: `users_${year}`
                }))
            });
        } else {
            // Search current users
            const currentUsers = await User.find(
                { username: searchRegex },
                { pin: 0 }
            ).limit(10);
            
            if (currentUsers.length > 0) {
                results.push({
                    year: 'current',
                    users: currentUsers.map(user => ({
                        ...user.toObject(),
                        collection: 'users'
                    }))
                });
            }

            // Search available years
            const years = await getAvailableYears();
            const yearSearches = years.slice(0, 3).map(async (yr) => {
                try {
                    const UserYear = getUserModelForYear(yr);
                    const users = await UserYear.find(
                        { username: searchRegex },
                        { pin: 0 }
                    ).limit(5);
                    
                    if (users.length > 0) {
                        return {
                            year: yr,
                            users: users.map(user => ({
                                ...user.toObject(),
                                collection: `users_${yr}`
                            }))
                        };
                    }
                    return null;
                } catch (error) {
                    return null;
                }
            });

            const yearResults = await Promise.all(yearSearches);
            results.push(...yearResults.filter(result => result !== null));
        }

        res.status(200).json({
            success: true,
            query: searchQuery,
            results
        });
    })
);

module.exports = router;