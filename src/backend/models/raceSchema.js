const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
	title: { type: String, required: true },
	starttime: { type: Date, required: true },
	endtime: { type: Date, required: true },
	status: { type: String, default: "scheduled" },
});

const driverUpdateSchema = new mongoose.Schema(
	{
		driverId: { type: mongoose.Schema.Types.ObjectId, required: true },
		driverName: { type: String, required: true },
		previousValue: { type: Number, required: true },
		pointsGained: { type: Number, required: true, default: 0 },
		expectedPoints: { type: Number, required: true },
		valueChange: { type: Number, required: true },
		newValue: { type: Number, required: true },
		percentageChange: { type: Number, required: true, default: 0 },
	},
	{ _id: false }
);

const ppmDataSchema = new mongoose.Schema(
	{
		ppm: { type: Number, required: true },
		venuePoints: { type: Number, required: true, default: 930 },
		totalMeetingPoints: { type: Number, required: true },
		totalDriverValue: { type: Number, required: true },
		processedAt: { type: Date, required: true, default: Date.now },
		driverUpdates: [driverUpdateSchema],
	},
	{ _id: false }
);

const raceSchemaWithEvents = new mongoose.Schema({
	roundNumber: { type: Number, required: true },
	name: { type: String, required: true },
	location: { type: String },
	events: [eventSchema],
	submissionDeadline: { type: Date, required: true },
	isLocked: { type: Boolean, default: false },
	isProcessed: { type: Boolean, default: false },
	ppmData: ppmDataSchema,
});

raceSchemaWithEvents.index({ isProcessed: 1, roundNumber: 1 });
raceSchemaWithEvents.index({ "ppmData.processedAt": 1 });

module.exports = raceSchemaWithEvents;
