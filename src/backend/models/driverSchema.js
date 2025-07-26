const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({
	name: { type: String, required: true, trim: true, unique: true },
	currentValue: { type: Number, required: true, min: 0, default: 0 },
	previousValue: { type: Number, required: true, min: 0, default: 0 },
	points: { type: Number, required: false, min: 0, default: 0 },
	categories: {
		type: [String],
		required: true,
		enum: ["M", "JS", "I"],
		validate: {
			validator: function (arr) {
				return arr.length === 1 || arr.length === 2;
			},
			message: "Categories must contain 1 or 2 items",
		},
	},
	imageURL: { type: String, required: false },
	description: { type: String, required: false },
});

module.exports = driverSchema;
