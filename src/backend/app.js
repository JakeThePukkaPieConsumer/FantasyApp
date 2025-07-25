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
const yearRoutes = require('./routes/year.route');

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

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
app.get("/dashboard", (req, res) => res.redirect('/dashboard.html'));
app.get("/admin", (req, res) => res.redirect('/admin.html'));
app.get("/select-drivers", (req, res) => res.redirect('/select-drivers.html'));

// Health check endpoint
app.get("/api/health", (req, res) => {
    try {
        res.status(200).json({
            success: true,
            status: "OK",
            timestamp: new Date().toLocaleString(),
            uptime: formatUptime(process.uptime()),
            message: "Server is running smoothly",
            environment: process.env.NODE_ENV || 'development',
            version: "1.0.0"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: "ERROR",
            message: "Health check failed"
        });
    }
});

// API Information endpoint
app.get("/api", (req, res) => {
    res.status(200).json({
        success: true,
        message: "BTCC Fantasy API",
        version: "1.0.0",
        endpoints: {
            auth: {
                login: "POST /api/auth/login",
                verify: "GET /api/auth/verify",
                users: "GET /api/auth/users",
                usersByYear: "GET /api/auth/users/:year",
                search: "GET /api/auth/search/:query"
            },
            drivers: {
                getAll: "GET /api/drivers/:year",
                getOne: "GET /api/drivers/:year/:id",
                create: "POST /api/drivers/:year (admin)",
                update: "PUT /api/drivers/:year/:id (admin)",
                delete: "DELETE /api/drivers/:year/:id (admin)",
                stats: "GET /api/drivers/:year/stats"
            },
            users: {
                getAll: "GET /api/admin/users (admin)",
                getOne: "GET /api/admin/users/:id (admin)",
                create: "POST /api/admin/users/users (admin + elevated)",
                update: "PUT /api/admin/users/:id (admin + elevated)",
                delete: "DELETE /api/admin/users/:id (admin + elevated)",
                elevate: "POST /api/admin/users/elevate (admin)",
                resetPin: "POST /api/admin/users/:id/reset-pin (admin + elevated)",
                stats: "GET /api/admin/users/stats (admin)"
            },
            years: {
                getAll: "GET /api/years",
                getStats: "GET /api/years/stats",
                getYearStats: "GET /api/years/:year/stats",
                initialize: "POST /api/years/:year/initialize (admin + elevated)",
                copy: "POST /api/years/copy (admin + elevated)",
                compare: "GET /api/years/:year1/compare/:year2",
                delete: "DELETE /api/years/:year (admin + elevated)"
            }
        },
        authentication: {
            required: "Most endpoints require authentication",
            adminRequired: "Some endpoints require admin role",
            elevationRequired: "Destructive operations require elevation token"
        }
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/years', yearRoutes);

// Handle undefined routes
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        next(new AppError(`API endpoint ${req.originalUrl} not found`, 404));
    } else {
        res.redirect('/login.html');
    }
});

app.use(globalErrorHandler);

module.exports = app;