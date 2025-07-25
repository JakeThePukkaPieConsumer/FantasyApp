const mongoose = require('mongoose');
const driverSchema = require('./driverSchema');
const userSchema = require('./userSchema')

const driverModelCache = {};
const userModelCache = {};

function getDriverModelForYear(year) {
    const modelName = `Driver_${year}`;
    const collectionName = `drivers_${year}`;

    if (driverModelCache[modelName]) {
        return driverModelCache[modelName];
    }

    const model = mongoose.model(modelName, driverSchema, collectionName);
    driverModelCache[modelName] = model;
    return model;
}

function getUserModelForYear(year) {
    const modelName = `User_${year}`;
    const collectionName = `drivers_${year}`;

    if (userModelCache[modelName]) {
        return userModelCache[modelName];
    }

    const model = mongoose.model(modelName, userSchema, collectionName);
    return model;
}

module.exports = { getDriverModelForYear, getUserModelForYear };