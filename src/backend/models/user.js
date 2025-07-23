const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    pin: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    budget: { type: Number, default: 0, min: 0 },
});

module.exports = mongoose.model('User', userSchema);