const mongoose = require("mongoose");

/**
 * Schema for a single event within a race.
 * @typedef {Object} Event
 * @property {string} title - Title of the event.
 * @property {Date} starttime - Date and time when the event starts
 * @property {Date} endtime - Date and time when the event ends
 * @property {string} [status="scheduled"] - Current status of the event.
 */
const eventSchema = new mongoose.Schema({
	title: { type: String, required: true },
	starttime: { type: Date, required: true },
	endtime: { type: Date, required: true },
	status: { type: String, default: "scheduled" },
});

/**
 * Schema for a race with multiple events.
 * @typedef {Object} RaceWithEvents
 * @property {number} roundNumber - Round number of the race.
 * @property {string} name - Name of the race.
 * @property {string} [location] - Location of the race.
 * @property {Event[]} events - Array of events within the race.
 * @property {Date} submissionDeadline - Deadline for roster submissions.
 * @property {boolean} [isLocked=false] - Indicates if submissions are locked.
 */
const raceSchemaWithEvents = new mongoose.Schema({
	roundNumber: { type: Number, required: true },
	name: { type: String, required: true },
	location: { type: String },
	events: [eventSchema],
	submissionDeadline: { type: Date, required: true },
	isLocked: { type: Boolean, default: false },
});

module.exports = raceSchemaWithEvents;
