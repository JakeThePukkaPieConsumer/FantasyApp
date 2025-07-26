import authModule from "./modules/auth.js";
import { createApiModules } from "./modules/api.js";
import notificationModule from "./modules/notification.js";

class Dashboard {
	constructor() {
		this.apiModules = createApiModules(authModule);
		this.currentUser = null;
	}

	async init() {
		console.log("Initializing dashboard...");

		try {
			await this.checkAuthentication();
			this.setupEventListeners();
			this.showDashboard();
		} catch (error) {
			console.error("Failed to initialize dashboard:", error);
			this.showUnauthorized();
		}
	}

	async checkAuthentication() {
		const authResult = await authModule.checkAuthentication();

		if (!authResult.success) {
			console.log("Authentication failed:", authResult.error);
			throw new Error("Not authenticated");
		}

		this.currentUser = authResult.user;
		console.log("Dashboard authentication successful");
	}

	setupEventListeners() {
		const logoutBtn = document.getElementById("logout-btn");
		if (logoutBtn) {
			logoutBtn.addEventListener("click", () => {
				authModule.logout();
			});
		}

		const adminPanelBtn = document.getElementById("admin-panel-btn");
		if (adminPanelBtn) {
			adminPanelBtn.addEventListener("click", () => {
				window.location.href = "/admin.html";
			});
		}

		this.setupQuickActions();

		console.log("Dashboard event listeners set up");
	}

	setupQuickActions() {
		const buildTeamBtns = document.querySelectorAll(
			'.btn[onclick*="select-drivers"], .btn:has(svg[class*="user-round-pen"])'
		);
		buildTeamBtns.forEach((btn) => {
			btn.removeAttribute("onclick");
			btn.addEventListener("click", () => {
				window.location.href = "/select-drivers.html";
			});
		});

		const leaderboardBtns = document.querySelectorAll(
			'.btn:has(svg[viewBox*="21h8M12"])'
		);
		leaderboardBtns.forEach((btn) => {
			btn.addEventListener("click", () => {
				notificationModule.info("Leaderboard coming soon!");
			});
		});

		const tracksBtns = document.querySelectorAll(
			'.btn:has(svg[viewBox*="20l-5.447"])'
		);
		tracksBtns.forEach((btn) => {
			btn.addEventListener("click", () => {
				notificationModule.info("Track information coming soon!");
			});
		});

		const driversBtns = document.querySelectorAll(
			'.btn:has(svg[viewBox*="20H4v-2"])'
		);
		driversBtns.forEach((btn) => {
			btn.addEventListener("click", () => {
				notificationModule.info("Driver profiles coming soon!");
			});
		});
	}

	showDashboard() {
		const loading = document.getElementById("loading");
		const unauthorized = document.getElementById("unauthorized");
		const dashboard = document.getElementById("dashboard");

		if (loading) loading.style.display = "none";
		if (unauthorized) unauthorized.style.display = "none";
		if (dashboard) dashboard.style.display = "block";

		this.updateUserInfo();

		this.updateAdminAccess();

		console.log("Dashboard displayed");
	}

	showUnauthorized() {
		const loading = document.getElementById("loading");
		const dashboard = document.getElementById("dashboard");
		const unauthorized = document.getElementById("unauthorized");

		if (loading) loading.style.display = "none";
		if (dashboard) dashboard.style.display = "none";
		if (unauthorized) unauthorized.style.display = "block";
	}

	updateUserInfo() {
		if (!this.currentUser) return;

		authModule.updateBudgetDisplays(this.currentUser.budget);

		const welcomeTitle = document.querySelector(".dashboard-welcome h2");
		if (welcomeTitle) {
			welcomeTitle.textContent = `Welcome back, ${this.currentUser.username}!`;
		}

		console.log("User info updated for:", this.currentUser.username);
	}

	updateAdminAccess() {
		const adminPanelBtn = document.getElementById("admin-panel-btn");

		if (adminPanelBtn) {
			if (authModule.isAdmin()) {
				adminPanelBtn.style.display = "inline-flex";
			} else {
				adminPanelBtn.style.display = "none";
			}
		}
	}

	async refreshUserData() {
		try {
			const authResult = await authModule.checkAuthentication();
			if (authResult.success) {
				this.currentUser = authResult.user;
				this.updateUserInfo();
				notificationModule.success("User data refreshed");
			} else {
				throw new Error("Failed to refresh user data");
			}
		} catch (error) {
			console.error("Error refreshing user data:", error);
			notificationModule.error("Failed to refresh user data");
		}
	}

	getCurrentUser() {
		return this.currentUser;
	}

	isAdmin() {
		return authModule.isAdmin();
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	console.log("Dashboard DOM loaded");

	const dashboard = new Dashboard();
	await dashboard.init();

	window.dashboard = dashboard;
});

document.addEventListener("visibilitychange", () => {
	if (!document.hidden && window.dashboard) {
		authModule.checkAuthentication().then((result) => {
			if (!result.success) {
				authModule.logout();
			} else {
				window.dashboard.refreshUserData();
			}
		});
	}
});

window.addEventListener("pageshow", (event) => {
	if (event.persisted && window.dashboard) {
		window.dashboard.refreshUserData();
	}
});
