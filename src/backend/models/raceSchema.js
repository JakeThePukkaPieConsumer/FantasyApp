const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    datetime: { type: Date, required: true },
    status: { type: String, default: 'scheduled' },
});

const raceSchemaWithEvents = new mongoose.Schema({
    roundNumber: { type: Number, required: true },
    name: { type: String, required: true },
    location: { type: String },
    events: [eventSchema],
    submissionDeadline: { type: Date, required: true },
    isLocked: { type: Boolean, default: false }
});

module.exports = raceSchemaWithEvents;