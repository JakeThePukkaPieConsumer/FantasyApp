import authModule from "./modules/auth.js";
import { createApiModules } from "./modules/api.js";
import notificationModule from "./modules/notification.js";
import DriverSelectionManager from "./modules/driverSelectionManager.js";
import DriverFilterManager from "./modules/driverFilterManager.js";
import DriverUIManager from "./modules/driverUIManager.js";
import DriverRosterManager from "./modules/driverRosterManager.js";

class DriverSelection {
	constructor() {
		this.apiModules = createApiModules(authModule);
		this.authModule = authModule;
		this.notificationModule = notificationModule;
		this.currentYear = this.authModule.getCurrentYear();

		this.selectionManager = new DriverSelectionManager(
			this.apiModules,
			this.authModule,
			this.notificationModule
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

export default DriverSelection;
