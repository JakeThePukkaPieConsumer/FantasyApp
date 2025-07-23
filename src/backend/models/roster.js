const mongoose = require('mongoose');

const rosterSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    drivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
    budgetUsed: { type: Number, default: 0, min: 0 },
    locked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Roster', rosterSchema);