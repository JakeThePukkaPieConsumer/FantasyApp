import authModule from "./auth.js";
import { createApiModules } from "./api.js";
import notificationModule from "./notification.js";
import {
	loadRaceInformation,
	checkRaceSubmissionEligibility,
} from "./raceUtils.js";
import DriverFilterManager from "./driverFilterManager.js";
import DriverUIManager from "./driverUIManager.js";
import DriverRosterManager from "./driverRosterManager.js";

class DriverSelectionManager {
	constructor(apiModules, authModule, notificationModule, currentYear) {
		this.apiModules = apiModules;
		this.authModule = authModule;
		this.notificationModule = notificationModule;
		this.currentYear = currentYear;

		this.drivers = [];
		this.selectedDrivers = [];
		this.currentRace = null;
		this.raceStatus = null;
		this.existingRoster = null;
		this.currentUser = null;
		this.maxDrivers = 5;
		this.requiredCategories = ["M", "JS", "I"];
	}

	async init() {
		console.log("Initializing DriverSelectionManager...");

		const authResult = await this.authModule.checkAuthentication();
		if (!authResult.success) {
			throw new Error("Authentication required");
		}

		this.currentUser = authResult.user;
		console.log("Authenticated user:", this.currentUser);

		await this.loadRaceInformation();

		await this.loadDrivers();

		if (this.currentRace) {
			await this.loadExistingRoster();
		}

		console.log("DriverSelectionManager initialized successfully");
	}

	async loadRaceInformation() {
		try {
			console.log("Loading race information...");
			const raceInfo = await loadRaceInformation({
				apiModules: this.apiModules,
				currentYear: this.currentYear,
			});

			this.currentRace = raceInfo.currentRace;

			if (this.currentRace) {
				await this.checkRaceEligibility();
				console.log("Race loaded:", this.currentRace.name);
			} else {
				console.log("No race available");
				this.raceStatus = {
					status: "no-race",
					message: "No races available for submissions",
					canSubmit: false,
				};
			}
		} catch (error) {
			console.error("Error loading race information:", error);
			this.raceStatus = {
				status: "error",
				message: "Error loading race information",
				canSubmit: false,
			};
		}
	}

	async checkRaceEligibility() {
		if (!this.currentRace) return;

		try {
			this.raceStatus = await checkRaceSubmissionEligibility({
				apiModules: this.apiModules,
				currentYear: this.currentYear,
				raceId: this.currentRace._id,
			});
		} catch (error) {
			console.error("Error checking race eligibility:", error);
			this.raceStatus = {
				status: "error",
				message: "Error checking race status",
				canSubmit: false,
			};
		}
	}

	async loadDrivers() {
		try {
			console.log("Loading drivers for year:", this.currentYear);
			const result = await this.apiModules.drivers.getDrivers(
				this.currentYear
			);

			if (!result.success) {
				throw new Error(result.error || "Failed to load drivers");
			}

			this.drivers = result.data.drivers || [];
			console.log(`Loaded ${this.drivers.length} drivers`);
		} catch (error) {
			console.error("Error loading drivers:", error);
			this.notificationModule.error(
				"Failed to load drivers: " + error.message
			);
			this.drivers = [];
		}
	}

	async loadExistingRoster() {
		if (!this.currentRace || !this.currentUser) return;

		try {
			const result = await this.apiModules.rosters.getRosters(
				this.currentYear,
				{
					user: this.currentUser.id,
					race: this.currentRace._id,
				}
			);

			if (
				result.success &&
				result.data.rosters &&
				result.data.rosters.length > 0
			) {
				this.existingRoster = result.data.rosters[0];

				if (this.existingRoster.drivers) {
					this.selectedDrivers = this.existingRoster.drivers
						.map((driverRef) => {
							const driverId =
								typeof driverRef === "object"
									? driverRef._id
									: driverRef;
							return this.drivers.find((d) => d._id === driverId);
						})
						.filter(Boolean);
				}

				console.log(
					"Loaded existing roster with",
					this.selectedDrivers.length,
					"drivers"
				);
			}
		} catch (error) {
			console.error("Error loading existing roster:", error);
		}
	}

	async refreshAllData() {
		try {
			await this.loadRaceInformation();
			await this.loadDrivers();
			if (this.currentRace) {
				await this.loadExistingRoster();
			}
			return true;
		} catch (error) {
			console.error("Error refreshing data:", error);
			this.notificationModule.error("Failed to refresh data");
			return false;
		}
	}

	selectDriver(driver) {
		if (!this.canModifyRoster()) {
			this.notificationModule.error(this.getRosterModificationError());
			return false;
		}

		if (this.selectedDrivers.find((d) => d._id === driver._id)) {
			this.notificationModule.info("Driver already selected");
			return false;
		}

		if (this.selectedDrivers.length >= this.maxDrivers) {
			this.notificationModule.warning("Team is full");
			return false;
		}

		const teamValue = this.getTeamValue() + (driver.value || 0);
		if (this.currentUser && teamValue > this.currentUser.budget) {
			this.notificationModule.warning("Cannot afford this driver");
			return false;
		}

		this.selectedDrivers.push(driver);
		console.log("Selected driver:", driver.name);
		return true;
	}

	removeDriver(driverId) {
		const index = this.selectedDrivers.findIndex((d) => d._id === driverId);
		if (index > -1) {
			const removed = this.selectedDrivers.splice(index, 1)[0];
			console.log("Removed driver:", removed.name);
			return true;
		}
		return false;
	}

	clearTeam() {
		if (!this.canModifyRoster()) {
			this.notificationModule.error(this.getRosterModificationError());
			return false;
		}

		this.selectedDrivers = [];
		return true;
	}

	validateTeamComposition() {
		const errors = [];

		const teamValue = this.getTeamValue();
		if (this.currentUser && teamValue > this.currentUser.budget) {
			errors.push("Team value exceeds budget");
		}

		if (!this.hasRequiredCategories()) {
			const missing = this.getMissingCategories();
			errors.push(`Missing required categories: ${missing.join(", ")}`);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	hasRequiredCategories() {
		const selectedCategories = new Set();
		this.selectedDrivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((cat) => selectedCategories.add(cat));
			}
		});

		return this.requiredCategories.every((cat) =>
			selectedCategories.has(cat)
		);
	}

	getMissingCategories() {
		const selectedCategories = new Set();
		this.selectedDrivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((cat) => selectedCategories.add(cat));
			}
		});

		return this.requiredCategories.filter(
			(cat) => !selectedCategories.has(cat)
		);
	}

	canModifyRoster() {
		return this.raceStatus && this.raceStatus.canSubmit;
	}

	getRosterModificationError() {
		if (!this.raceStatus) return "Race status not available";
		return this.raceStatus.message || "Cannot modify roster";
	}

	getCurrentUser() {
		return this.currentUser;
	}

	getDrivers() {
		return [...this.drivers];
	}

	getSelectedDrivers() {
		return [...this.selectedDrivers];
	}

	getCurrentRace() {
		return this.currentRace;
	}

	getRaceStatus() {
		return this.raceStatus;
	}

	getExistingRoster() {
		return this.existingRoster;
	}

	getTeamValue() {
		return this.selectedDrivers.reduce(
			(total, driver) => total + (driver.value || 0),
			0
		);
	}

	formatCurrency(value) {
		return (value || 0).toLocaleString("en-GB", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	}

	cleanup() {
		console.log("DriverSelectionManager cleaned up");
	}
}

class DriverSelection {
	constructor() {
		this.authModule = authModule;
		this.notificationModule = notificationModule;
		this.currentYear = this.authModule.getCurrentYear();
		this.apiModules = createApiModules(authModule);

		this.selectionManager = new DriverSelectionManager(
			this.apiModules,
			this.authModule,
			this.notificationModule,
			this.currentYear
		);

		this.filterManager = new DriverFilterManager();

		this.uiManager = new DriverUIManager(
			this.selectionManager,
			this.filterManager,
			this.notificationModule
		);

		this.rosterManager = new DriverRosterManager(
			this.apiModules,
			this.currentYear,
			this.notificationModule
		);

		this.hasInitialized = false;
	}

	async init() {
		if (this.hasInitialized) return;

		console.log("Initializing driver selection...");

		try {
			await this.selectionManager.init();
			this.filterManager.setDrivers(this.selectionManager.getDrivers());
			this.uiManager.init();
			this.uiManager.showDriverSelection();

			this.hasInitialized = true;
			console.log("Driver selection initialized successfully");
		} catch (err) {
			console.error("Failed to initialize driver selection:", err);
			this.uiManager.showUnauthorized();
		}
	}

	getCurrentUser() {
		return this.selectionManager.getCurrentUser();
	}

	getSelectedDrivers() {
		return this.selectionManager.getSelectedDrivers();
	}

	getAvailableDrivers() {
		return this.selectionManager
			.getDrivers()
			.filter(
				(driver) =>
					!this.selectionManager
						.getSelectedDrivers()
						.some((selected) => selected._id === driver._id)
			);
	}

	getCurrentRace() {
		return this.selectionManager.getCurrentRace();
	}

	getRaceStatus() {
		return this.selectionManager.getRaceStatus();
	}

	isInitialized() {
		return this.hasInitialized;
	}

	cleanup() {
		this.uiManager.cleanup();
		this.hasInitialized = false;
	}

	debug() {
		if (
			typeof process !== "undefined" &&
			process.env?.NODE_ENV === "development"
		) {
			return {
				selectionManager: this.selectionManager,
				filterManager: this.filterManager,
				uiManager: this.uiManager,
				rosterManager: this.rosterManager,
				currentRace: this.getCurrentRace(),
				raceStatus: this.getRaceStatus(),
				selectedDrivers: this.getSelectedDrivers(),
				currentUser: this.getCurrentUser(),
			};
		}
		return null;
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	console.log("Driver selection DOM loaded");

	const driverSelection = new DriverSelection();

	try {
		await driverSelection.init();

		if (
			typeof process !== "undefined" &&
			process.env?.NODE_ENV === "development"
		) {
			window.driverSelection = driverSelection;
			window.driverSelectionDebug = driverSelection.debug();
		}
	} catch (error) {
		console.error("Failed to initialize driver selection:", error);
	}
});

document.addEventListener("visibilitychange", () => {
	if (!document.hidden && window.driverSelection?.isInitialized()) {
		authModule
			.checkAuthentication()
			.then((result) => {
				if (!result.success) {
					authModule.logout();
				}
			})
			.catch((error) => {
				console.error(
					"Error checking authentication on visibility change:",
					error
				);
			});
	}
});

window.addEventListener("beforeunload", () => {
	if (window.driverSelection) {
		window.driverSelection.cleanup();
	}
});

export default DriverSelectionManager;
