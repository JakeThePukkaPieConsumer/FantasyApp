const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { globalErrorHandler, AppError } = require('./middleware/errorHandler');
const { formatUptime } = require('./utils/formatTme');

// Routes
const authRoutes = require('./routes/auth.route');   
const userRoutes = require('./routes/user.route');
const driverRoutes = require('./routes/driver.route');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
    max: 100, // limit each IP to 100 requests per windowMs
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// CORS
app.use(cors());

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan("dev"));
}

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// HTML page routes - these handle direct navigation
app.get("/", (req, res) => res.redirect('/login.html'));
app.get("/login", (req, res) => res.redirect('/login.html'));
app.get("/user/dashboard", (req, res) => res.redirect('/dashboard.html'));
app.get("/user/admin", (req, res) => res.redirect('/admin.html'));
app.get("/user/select-drivers", (req, res) => res.redirect('/select-drivers.html'));

app.get("/api/health", (req, res) => {
    try {
        res.status(200).json({
            success: true,
            status: "OK",
            timestamp: new Date().toLocaleString(),
            uptime: formatUptime(process.uptime()),
            message: "Server is running smoothly",
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: "ERROR",
            message: "Health check failed"
        });
    }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin/users', userRoutes);


// Handle undefined routes
app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware (must be last)
app.use(globalErrorHandler);

module.exports = app;