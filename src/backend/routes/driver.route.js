const express = require('express');
const mongoose = require('mongoose');
const Driver = require('../models/drivers');
const {
    createDriverValidation,
    updateDriverValidation,
    mongoIdValidation,
    handleValidationErrors
} = require('../middleware/validation');
const { checkRole } = require('../middleware/rbac');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { body } = require('express-validator');
const { authenticateToken, checkElevated } = require('../middleware/auth');

const router = express.Router();

// Get all drivers
router.get('/drivers',
    authenticateToken,
    catchAsync(async (req, res) => {
        const drivers = await Driver.find().select('-__v');
        res.status(200).json({
            success: true,
            drivers
        });
    })
);

// Create a new driver
router.post('/admin/drivers',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    createDriverValidation,
    catchAsync(async (req, res) => {
        const { name, value = 0, categories } = req.body;

        const trimmedName = name.trim();

        const existingDriver = await Driver.findOne({
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
        });

        if (existingDriver) {
            throw new AppError('A driver with this name already exists', 409);
        }

        const newDriver = new Driver({
            name: trimmedName,
            value,
            categories
        });

        await newDriver.save();

        const driverResponse = {
            id: newDriver._id,
            name: newDriver.name,
            value: newDriver.value,
            categories: newDriver.categories
        };

        res.status(201).json({
            success: true,
            message: 'Driver created successfully',
            driver: driverResponse
        });
    })
);

// Update a current driver
router.put('/admin/drivers/:id',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    mongoIdValidation(),
    updateDriverValidation,
    catchAsync(async (req, res) => {
        const driverId = req.params.id;
        const updates = req.body;

        const allowedUpdated = ['name', 'value', 'categories', 'imageURL', 'description'];
        const actualUpdates = Object.keys(updates).filter(key => allowedUpdated.includes(key));

        if (actualUpdates.length === 0) {
            throw new AppError('No valid fields provided for updates', 400);
        }

        if (updates.name) {
            updates.name = updates.name.trim();

            const existingDriver = await Driver.findOne({
                name: { $regex: new RegExp(`^${updates.name}$`, 'i') },
                _id: { $ne: driverId }
            });

            if (existingDriver) {
                throw new AppError('A driver with this name already exists', 409);
            }
        }

        const driver = await Driver.findById(driverId);
        if (!driver) {
            throw new AppError('Driver not found', 404);
        }

        const filteredUpdates = {};
        actualUpdates.forEach(key => {
            filteredUpdates[key] = updates[key];
        });

        const updatedDriver = await Driver.findByIdAndUpdate(
            driverId,
            { $set: filteredUpdates },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Driver was updated successfully',
            driver: updatedDriver
        });
    })
);

// Delete a current driver
router.delete('/admin/drivers/:id',
    authenticateToken,
    checkRole('admin'),
    checkElevated,
    mongoIdValidation(),
    catchAsync(async (req, res) => {
        const driverIdToDelete = req.params.id;

        const driverToDelete = await Driver.findById(driverIdToDelete);
        if (!driverToDelete) {
            throw new AppError('Driver not found', 404);
        }

        await Driver.findByIdAndDelete(driverIdToDelete);

        res.status(200).json({
            success: true,
            message: 'Driver deleted successfully',
            deletedDriver: {
                id: driverToDelete._id,
                name: driverToDelete.name,
                categories: driverToDelete.categories,
                value: driverToDelete.value
            }
        });
    })
);

// Get driver statistics
router.get('/stats',
    authenticateToken,
    catchAsync(async (req, res) => {
        const [
            totalDriver
        ] = await Promise.all([
            Driver.countDocuments(),
            Driver.aggregate([
                { $group: { _id: null, total: { $sum: '$value' } } }
            ])
        ]);

        res.status(200).json({
            success: true,
            stats: {
                users: {
                    total: totalDriver
                },
                value: {
                    total: totalValueAgg[0]?.total || 0
                }
            }
        });
    })
);

module.exports = router;