const mongoose = require('mongoose');

const rosterSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    drivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true }],
    budgetUsed: { type: Number, default: 0, min: 0, required: true },
    race: { type: mongoose.Schema.Types.ObjectId, ref: 'Race', required: true },
    pointsEarned: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Roster', rosterSchema);