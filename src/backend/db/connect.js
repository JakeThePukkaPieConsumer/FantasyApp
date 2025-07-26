const chalk = require("chalk");
const mongoose = require("mongoose");

const connectDB = async () => {
	try {
		if (!process.env.MONGO_URI) {
			throw new Error(
				"MONGO_URI is not defined in environment variables"
			);
		}

		const conn = await mongoose.connect(process.env.MONGO_URI, {
			serverSelectionTimeoutMS: 5000,
			socketTimeoutMS: 45000,
		});

		console.log(
			chalk.blue(`\n✅ MongoDB Connected: ${conn.connection.host}`)
		);
		return conn;
	} catch (error) {
		console.error(
			chalk.bgRed.white("❌ MongoDB connection failed:"),
			error.message
		);
		throw error;
	}
};

mongoose.connection.on("error", (err) => {
	console.error(chalk.red("MongoDB connection error:"), err);
});

mongoose.connection.on("disconnected", () => {
	console.log(chalk.yellow("MongoDB disconnected"));
});

process.on("SIGINT", async () => {
	await mongoose.connection.close();
	console.log(
		chalk.yellow("MongoDB connection closed through app termination")
	);
	process.exit(0);
});

module.exports = connectDB;