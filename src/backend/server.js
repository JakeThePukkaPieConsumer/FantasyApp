require("dotenv").config({ quiet: true });
const chalk = require("chalk");
const app = require("./app");
const connectDB = require("./db/connect");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
	try {
		await connectDB();

		const server = app.listen(PORT, () => {
			console.log(chalk.blue(`🚀 Server is running on port ${PORT}`));
			console.log(
				chalk.blue(
					`📖 Environment: ${process.env.NODE_ENV || "development"}`
				)
			);
		});

		server.on("error", (error) => {
			if (error.code === "EADDRINUSE") {
				console.error(chalk.red(`❌ Port ${PORT} is already in use`));
			} else {
				console.error(chalk.red("❌ Server error:"), error);
			}
			process.exit(1);
		});

		return server;
	} catch (error) {
		console.error(
			chalk.red("❌ Error starting the server:"),
			error.message
		);
		process.exit(1);
	}
};

process.on("uncaughtException", (error) => {
	console.error(chalk.bgRed.white("💥 UNCAUGHT EXCEPTION! Shutting down..."));
	console.error(chalk.red("Error:"), error.name, error.message);
	console.error(chalk.red("Stack:"), error.stack);
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error(
		chalk.bgRed.white("💥 UNHANDLED REJECTION! Shutting down...")
	);
	console.error(chalk.red("Promise:"), promise);
	console.error(chalk.red("Reason:"), reason);
	process.exit(1);
});

const gracefulShutdown = (signal) => {
	console.log(chalk.yellow(`\n📡 ${signal} received, shutting down...`));

	setTimeout(() => {
		console.log(chalk.yellow("🛑 Process terminated"));
		process.exit(0);
	}, 5000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer().catch((error) => {
	console.error(chalk.red("❌ Failed to start server:"), error);
	process.exit(1);
});
