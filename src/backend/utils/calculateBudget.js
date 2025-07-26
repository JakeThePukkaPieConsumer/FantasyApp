const mongoose = require('mongoose');
const { getDriverModelForYear, getUserModelForYear } = require('../models/modelPerYear');

/**
 * Calculate the total budget used for a list of drivers
 * @param {Array} driverIds - Array of driver ObjectIds
 * @param {string} year - Year to query
 * @returns {Promise<number>} Total budget value
 */
async function calculateDriversBudget(driverIds, year) {
    try {
        const Driver = getDriverModelForYear(year);
        
        // Get all drivers by their IDs
        const drivers = await Driver.find({ 
            _id: { $in: driverIds } 
        }).select('value');
        
        // Calculate total value
        const totalValue = drivers.reduce((sum, driver) => sum + driver.value, 0);
        
        return totalValue;
    } catch (error) {
        console.error('Error calculating drivers budget:', error);
        throw new Error('Failed to calculate drivers budget');
    }
}

/**
 * Validate that the user has sufficient budget for selected drivers
 * @param {string} userId - User ObjectId
 * @param {Array} driverIds - Array of driver ObjectIds  
 * @param {string} year - Year to query
 * @returns {Promise<Object>} Validation result with budget info
 */
async function validateUserBudget(userId, driverIds, year) {
    try {
        const User = getUserModelForYear(year);
        const user = await User.findById(userId).select('budget');
        
        if (!user) {
            throw new Error('User not found');
        }
        
        const totalDriverValue = await calculateDriversBudget(driverIds, year);
        
        const isValid = totalDriverValue <= user.budget;
        const remainingBudget = user.budget - totalDriverValue;
        
        return {
            isValid,
            userBudget: user.budget,
            totalDriverValue,
            remainingBudget,
            exceedsBy: isValid ? 0 : totalDriverValue - user.budget
        };
    } catch (error) {
        console.error('Error validating user budget:', error);
        throw error;
    }
}

/**
 * Validate driver categories to ensure required categories are present
 * @param {Array} driverIds - Array of driver ObjectIds
 * @param {string} year - Year to query
 * @param {Array} requiredCategories - Required categories (default: ['M', 'JS', 'I'])
 * @returns {Promise<Object>} Validation result
 */
async function validateDriverCategories(driverIds, year, requiredCategories = ['M', 'JS', 'I']) {
    try {
        const Driver = getDriverModelForYear(year);
        const drivers = await Driver.find({ 
            _id: { $in: driverIds } 
        }).select('categories');
        
        // Get all unique categories from selected drivers
        const presentCategories = new Set();
        drivers.forEach(driver => {
            driver.categories.forEach(category => {
                presentCategories.add(category);
            });
        });
        
        // Check which required categories are missing
        const missingCategories = requiredCategories.filter(
            category => !presentCategories.has(category)
        );
        
        return {
            isValid: missingCategories.length === 0,
            presentCategories: Array.from(presentCategories),
            missingCategories,
            requiredCategories
        };
    } catch (error) {
        console.error('Error validating driver categories:', error);
        throw error;
    }
}

/**
 * Comprehensive roster validation
 * @param {Object} rosterData - Roster data to validate
 * @param {string} year - Year to query
 * @returns {Promise<Object>} Complete validation result
 */
async function validateRosterData(rosterData, year) {
    const { user: userId, drivers: driverIds, budgetUsed } = rosterData;
    
    try {
        const [budgetValidation, categoryValidation, calculatedBudget] = await Promise.all([
            validateUserBudget(userId, driverIds, year),
            validateDriverCategories(driverIds, year),
            calculateDriversBudget(driverIds, year)
        ]);
        
        const budgetMismatch = Math.abs(calculatedBudget - budgetUsed) > 0.01;
        
        const errors = [];
        
        if (!budgetValidation.isValid) {
            errors.push(`Budget exceeded by £${budgetValidation.exceedsBy.toFixed(2)}`);
        }
        
        if (!categoryValidation.isValid) {
            errors.push(`Missing required categories: ${categoryValidation.missingCategories.join(', ')}`);
        }
        
        if (budgetMismatch) {
            errors.push(`Budget mismatch: calculated £${calculatedBudget}, provided £${budgetUsed}`);
        }
        
        if (driverIds.length === 0) {
            errors.push('Must select at least one driver');
        }
        
        const uniqueDrivers = new Set(driverIds.map(id => id.toString()));
        if (uniqueDrivers.size !== driverIds.length) {
            errors.push('Duplicate drivers are not allowed');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            budgetInfo: budgetValidation,
            categoryInfo: categoryValidation,
            calculatedBudget,
            providedBudget: budgetUsed
        };
        
    } catch (error) {
        console.error('Error in comprehensive roster validation:', error);
        throw error;
    }
}

module.exports = {
    calculateDriversBudget,
    validateUserBudget,
    validateDriverCategories,
    validateRosterData
};