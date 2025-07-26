const mongoose = require("mongoose");

/**
 * Driver Schema
 *
 * Represents a driver with attributes including name, value, points, categories, and optional media.
 *
 * @typedef {Object} Driver
 * @property {string} name - Unique driver name (required, trimmed).
 * @property {number} value - Numeric value of the driver (required, min 0, default 0).
 * @property {number} [points=0] - Driver points (optional, min 0, default 0).
 * @property {string[]} categories - Array of 1 or 2 categories; each must be one of: "M", "JS", or "I" (required).
 * @property {string} [imageURL] - Optional URL to driver's image.
 * @property {string} [description] - Optional description of the driver.
 */
const driverSchema = new mongoose.Schema({
	name: { type: String, required: true, trim: true, unique: true },
	value: { type: Number, required: true, min: 0, default: 0 },
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
