import authModule from "./modules/auth.js";
import { createApiModules } from "./modules/api.js";
import modalModule from "./modules/modal.js";
import notificationModule from "./modules/notification.js";
import ElevationModule from "./modules/elevation.js";
import UserManager from "./modules/userManager.js";
import DriverManager from "./modules/driverManager.js";

class AdminPanel {
	constructor() {
		this.elevationModule = new ElevationModule(
			null,
			modalModule,
			notificationModule
		);

		this.apiModules = createApiModules(authModule, this.elevationModule);
		this.elevationModule.apiModule = this.apiModules;

		this.userManager = new UserManager(
			this.apiModules,
			modalModule,
			notificationModule,
			this.elevationModule,
			authModule
		);

		this.driverManager = new DriverManager(
			this.apiModules,
			modalModule,
			notificationModule,
			this.elevationModule,
			authModule
		);
	}

	async init() {
		console.log("Initializing admin panel...");

		try {
			await this.initializeModules();
			await this.checkAuthentication();

			this.showAdminPanel();
			this.setupEventListeners();
		} catch (error) {
			console.error("Failed to initialize admin panel:", error);
			this.showError();
		}
	}

	async checkAuthentication() {
		const authResult = await authModule.checkAuthentication();

		if (!authResult.success) {
			console.log("Authentication failed:", authResult.error);
			throw new Error("Not authenticated");
		}

		if (!authModule.isAdmin()) {
			console.log("User is not an admin");
			throw new Error("Not authorized");
		}

		console.log("Admin authentication successful");
	}

	async initializeModules() {
		this.elevationModule.init();

		this.userManager.init();
		this.driverManager.init();

		console.log("All modules initialized");
	}

	setupEventListeners() {
		const logoutBtn = document.getElementById("logout-btn");
		if (logoutBtn) {
			logoutBtn.addEventListener("click", () => {
				authModule.logout();
			});
		}

		const dashboardBtn = document.getElementById("dashboard-btn");
		if (dashboardBtn) {
			dashboardBtn.addEventListener("click", () => {
				window.location.href = "/dashboard.html";
				console.log("test");
			});
		}

		console.log("Event listeners set up");
	}

	showAdminPanel() {
		const loading = document.getElementById("loading");
		const unauthorized = document.getElementById("unauthorized");
		const adminPanel = document.getElementById("admin-panel");

		if (loading) loading.style.display = "none";
		if (unauthorized) unauthorized.style.display = "none";
		if (adminPanel) adminPanel.style.display = "block";

		this.updateUserInfo();

		console.log("Admin panel displayed");
	}

	showError() {
		const loading = document.getElementById("loading");
		const unauthorized = document.getElementById("unauthorized");
		const adminPanel = document.getElementById("admin-panel");

		if (loading) loading.style.display = "none";
		if (adminPanel) adminPanel.style.display = "none";
		if (unauthorized) unauthorized.style.display = "block";
	}

	updateUserInfo() {
		const currentUser = authModule.getCurrentUser();
		if (!currentUser) return;

		authModule.updateBudgetDisplays(currentUser.budget);

		const welcomeTitle = document.querySelector(".dashboard-welcome h2");
		if (welcomeTitle) {
			welcomeTitle.textContent = `Welcome back, ${currentUser.username}!`;
		}

		console.log("User info updated");
	}

	async refreshData() {
		try {
			await this.userManager.refresh();
			await this.driverManager.refresh();
			notificationModule.success("Data refreshed successfully");
		} catch (error) {
			console.error("Error refreshing data:", error);
			notificationModule.error("Failed to refresh data");
		}
	}

	getUserManager() {
		return this.userManager;
	}

	getDriverManager() {
		return this.driverManager;
	}

	getElevationModule() {
		return this.elevationModule;
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	console.log("Admin panel DOM loaded");

	const adminPanel = new AdminPanel();
	await adminPanel.init();

	window.adminPanel = adminPanel;
});

document.addEventListener("visibilitychange", () => {
	if (!document.hidden && window.adminPanel) {
		authModule.checkAuthentication().then((result) => {
			if (!result.success || !authModule.isAdmin()) {
				authModule.logout();
			}
		});
	}
});
