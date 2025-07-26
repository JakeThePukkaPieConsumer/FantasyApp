const mongoose = require("mongoose");

const raceResultSchema = new mongoose.Schema({
	raceId: { type: mongoose.Schema.ObjectId, ref: ""}
})