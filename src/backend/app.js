const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { globalErrorHandler, AppError } = require("./middleware/errorHandler");
const { formatUptime } = require("./utils/formatTme");

const authRoutes = require("./routes/auth.route");
const userRoutes = require("./routes/user.route");
const driverRoutes = require("./routes/driver.route");
const rosterRoutes = require("./routes/roster.route");
const yearRoutes = require("./routes/year.route");

const app = express();

app.use(helmet());
app.set("trust proxy", 1);

const limiter = rateLimit({
	max: 100,
	windowMs: 15 * 60 * 1000,
	message: {
		success: false,
		error: "Too many requests from this IP, please try again later.",
	},
});
app.use("/api", limiter);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use(cors({ credentials: true }));

if (process.env.NODE_ENV === "development") {
	app.use(morgan("dev"));
}

app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => res.redirect("/login.html"));
app.get("/login", (req, res) => res.redirect("/login.html"));
app.get("/dashboard", (req, res) => res.redirect("/dashboard.html"));
app.get("/admin", (req, res) => res.redirect("/admin.html"));
app.get("/select-drivers", (req, res) => res.redirect("/select-drivers.html"));

app.get("/api/health", (req, res) => {
	try {
		res.status(200).json({
			success: true,
			status: "OK",
			timestamp: new Date().toLocaleString(),
			uptime: formatUptime(process.uptime()),
			message: "Server is running smoothly",
			environment: process.env.NODE_ENV || "development",
			version: "1.0.0",
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			status: "ERROR",
			message: "Health check failed",
		});
	}
});

app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/rosters", rosterRoutes);
app.use("/api/admin/users", userRoutes);
app.use("/api/years", yearRoutes);

app.use((req, res, next) => {
	if (req.path.startsWith("/api/")) {
		next(new AppError(`API endpoint ${req.originalUrl} not found`, 404));
	} else {
		res.redirect("/login.html");
	}
});

app.use(globalErrorHandler);

module.exports = app;
