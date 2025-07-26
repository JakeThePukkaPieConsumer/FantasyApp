const mongoose = require("mongoose");

/**
 * Schema representing a user in the system.
 * @typedef {Object} User
 * @property {string} username - Unique username for the user.
 * @property {string} pin - User's PIN (password or code).
 * @property {"admin"|"user"} [role="user"] - Role of the user, either "admin" or "user".
 * @property {number} [budget=0] - User's budget, cannot be negative.
 * @property {number} [points=0] - User's points, cannot be negative.
 */
const userSchema = new mongoose.Schema({
	username: { type: String, required: true, unique: true },
	pin: { type: String, required: true },
	role: { type: String, enum: ["admin", "user"], default: "user" },
	budget: { type: Number, default: 0, min: 0 },
	points: { type: Number, default: 0, min: 0 },
});

module.exports = userSchema;
