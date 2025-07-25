const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/userSchema');
const { getUserModelForYear } = require('../models/modelPerYear');
const { genToken, authenticateToken } = require('../middleware/auth');
const { loginValidation } = require('../middleware/validation');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const router = express.Router();

router.get('/user/users', catchAsync(async (req, res) => {
    const users = await User.find({}, { pin: 0 }).sort({ username: 1 });
    res.status(200).json({ success: true, users });
}));

router.get('/user/:year/users', catchAsync(async (req, res) => {
    const year = req.params.year;
    if (!/^\d{4}$/.test(year)) {
        return res.status(400).json({ success: false, message: 'Invalid year parameter' });
    }


    const UserYearModel = getUserModelForYear(year);

    const users = await UserYearModel.find({}, { pin: 0 }).sort({ username: 1 });

    res.status(200).json({ success: true, users });
}));


router.post('/user/login', loginValidation, catchAsync(async (req, res, next) => {
    const { username, pin } = req.body;

    const user = await User.findOne({ username }).select('+pin');
    if (!user) {
        return next(new AppError('Invalid PIN', 401));
    }

    const valid = await bcrypt.compare(pin, user.pin);
    if (!valid) {
        return next(new AppError('Invalid PIN', 401));
    }

    const token = genToken(user._id);

    res.status(200).json({ 
        success: true,
        message: 'Login successful', 
        token,
        user: { 
            username: user.username, 
            role: user.role,
            budget: user.budget
        } 
    });
}));

router.get('/user/verify', authenticateToken, (req, res) => {
    const { username, role, budget } = req.user;

    res.status(200).json({ 
        success: true,
        user: { username, role, budget } 
    });
});

module.exports = router;