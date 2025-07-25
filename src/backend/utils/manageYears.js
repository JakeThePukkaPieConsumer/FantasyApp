require('dotenv').config();
const mongoose = require('mongoose');
const chalk = require('chalk');
const {
    getAvailableYears,
    initializeYearCollections,
    copyYearData,
    getYearStatistics,
    validateYear
} = require('../models/modelPerYear');

// Connect to database
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log(chalk.blue('✅ Connected to MongoDB'));
    } catch (error) {
        console.error(chalk.red('❌ MongoDB connection failed:'), error.message);
        process.exit(1);
    }
}

// Display usage information
function showUsage() {
    console.log(chalk.yellow('\n📋 BTCC Year Management Utility\n'));
    console.log(chalk.white('Usage: node manageYears.js <command> [options]\n'));
    
    console.log(chalk.cyan('Commands:'));
    console.log(chalk.white('  list                     - List all available years'));
    console.log(chalk.white('  stats [year]             - Show statistics (all years or specific)'));
    console.log(chalk.white('  init <year>              - Initialize collections for a year'));
    console.log(chalk.white('  copy <from> <to> [type]  - Copy data between years'));
    console.log(chalk.white('  compare <year1> <year2>  - Compare two years'));
    console.log(chalk.white('  help                     - Show this help\n'));
    
    console.log(chalk.cyan('Copy types (optional):'));
    console.log(chalk.white('  drivers                  - Copy only drivers'));
    console.log(chalk.white('  users                    - Copy only users'));
    console.log(chalk.white('  drivers,users            - Copy both (default)'));
    console.log(chalk.white('  all                      - Copy drivers, users, and races\n'));
    
    console.log(chalk.cyan('Examples:'));
    console.log(chalk.white('  node manageYears.js list'));
    console.log(chalk.white('  node manageYears.js stats 2024'));
    console.log(chalk.white('  node manageYears.js init 2025'));
    console.log(chalk.white('  node manageYears.js copy 2024 2025'));
    console.log(chalk.white('  node manageYears.js copy 2024 2025 drivers'));
    console.log(chalk.white('  node manageYears.js compare 2024 2025\n'));
}

// List all available years
async function listYears() {
    try {
        const years = await getAvailableYears();
        
        if (years.length === 0) {
            console.log(chalk.yellow('📭 No year-based collections found'));
            return;
        }
        
        console.log(chalk.blue('\n📅 Available Years:'));
        
        for (const year of years) {
            try {
                const stats = await getYearStatistics(year);
                console.log(chalk.white(`\n  ${year}:`));
                console.log(chalk.gray(`    Drivers: ${stats.drivers.count} (Total Value: £${stats.drivers.totalValue.toLocaleString()})`));
                console.log(chalk.gray(`    Users: ${stats.users.count} (Total Budget: £${stats.users.totalBudget.toLocaleString()})`));
                console.log(chalk.gray(`    Races: ${stats.races.count}`));
                console.log(chalk.gray(`    Rosters: ${stats.rosters.count}`));
            } catch (error) {
                console.log(chalk.white(`\n  ${year}:`));
                console.log(chalk.red(`    Error: ${error.message}`));
            }
        }
        console.log();
    } catch (error) {
        console.error(chalk.red('❌ Error listing years:'), error.message);
    }
}

// Show statistics
async function showStats(year = null) {
    try {
        if (year) {
            if (!validateYear(year)) {
                console.error(chalk.red(`❌ Invalid year: ${year}`));
                return;
            }
            
            const stats = await getYearStatistics(year);
            console.log(chalk.blue(`\n📊 Statistics for ${year}:\n`));
            
            console.log(chalk.cyan('Drivers:'));
            console.log(chalk.white(`  Count: ${stats.drivers.count}`));
            console.log(chalk.white(`  Total Value: £${stats.drivers.totalValue.toLocaleString()}\n`));
            
            console.log(chalk.cyan('Users:'));
            console.log(chalk.white(`  Count: ${stats.users.count}`));
            console.log(chalk.white(`  Total Budget: £${stats.users.totalBudget.toLocaleString()}\n`));
            
            console.log(chalk.cyan('Races:'));
            console.log(chalk.white(`  Count: ${stats.races.count}\n`));
            
            console.log(chalk.cyan('Rosters:'));
            console.log(chalk.white(`  Count: ${stats.rosters.count}\n`));
        } else {
            await listYears();
        }
    } catch (error) {
        console.error(chalk.red(`❌ Error getting statistics: ${error.message}`));
    }
}

// Initialize year collections
async function initializeYear(year) {
    try {
        if (!validateYear(year)) {
            console.error(chalk.red(`❌ Invalid year: ${year}`));
            return;
        }
        
        console.log(chalk.blue(`🔧 Initializing collections for ${year}...`));
        
        const models = await initializeYearCollections(year);
        
        console.log(chalk.green(`✅ Successfully initialized collections for ${year}:`));
        Object.keys(models).forEach(modelName => {
            console.log(chalk.white(`   - ${modelName}`));
        });
    } catch (error) {
        console.error(chalk.red(`❌ Error initializing year ${year}: ${error.message}`));
    }
}

// Copy data between years
async function copyData(fromYear, toYear, collections = 'drivers,users') {
    try {
        if (!validateYear(fromYear) || !validateYear(toYear)) {
            console.error(chalk.red('❌ Invalid year provided'));
            return;
        }
        
        if (fromYear === toYear) {
            console.error(chalk.red('❌ Source and target years cannot be the same'));
            return;
        }
        
        // Parse collections
        let collectionsArray;
        if (collections === 'all') {
            collectionsArray = ['drivers', 'users', 'races'];
        } else {
            collectionsArray = collections.split(',').map(c => c.trim());
        }
        
        console.log(chalk.blue(`🔄 Copying data from ${fromYear} to ${toYear}...`));
        console.log(chalk.gray(`   Collections: ${collectionsArray.join(', ')}`));
        
        // Initialize target year if needed
        try {
            await initializeYearCollections(toYear);
            console.log(chalk.green(`✅ Initialized target year ${toYear}`));
        } catch (error) {
            console.log(chalk.yellow(`⚠️  Target year ${toYear} collections may already exist`));
        }
        
        const summary = await copyYearData(fromYear, toYear, collectionsArray);
        
        console.log(chalk.green(`\n✅ Copy completed successfully:`));
        if (summary.drivers > 0) {
            console.log(chalk.white(`   Drivers copied: ${summary.drivers}`));
        }
        if (summary.users > 0) {
            console.log(chalk.white(`   Users copied: ${summary.users}`));
        }
        if (summary.races > 0) {
            console.log(chalk.white(`   Races copied: ${summary.races}`));
        }
        
        if (summary.errors.length > 0) {
            console.log(chalk.red(`\n⚠️  Errors encountered:`));
            summary.errors.forEach(error => {
                console.log(chalk.red(`   - ${error}`));
            });
        }
        
    } catch (error) {
        console.error(chalk.red(`❌ Error copying data: ${error.message}`));
    }
}