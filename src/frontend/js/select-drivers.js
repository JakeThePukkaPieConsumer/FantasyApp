import authModule from "./modules/auth.js";
import { loadRaceInformation } from "./modules/raceUtils.js";
import { createApiModules } from "./modules/api.js";
import notificationModule from "./modules/notification.js";

class DriverSelection {
	constructor() {
		this.apiModules = createApiModules(authModule);
		this.authModule = authModule;
		this.currentUser = null;
		this.drivers = [];
		this.currentYear = this.authModule.getCurrentYear();
		this.selectedDrivers = [];
		this.filteredDrivers = [];
		this.currentFilter = "all";
		this.maxDrivers = 6;
		this.sortByValue = false;
		this.currentRace = null;
		this.raceStatus = null;
		this.existingRoster = null;
		this.deadlineTimer = null;

		this.isLoading = false;
		this.hasInitialized = false;

		this.getRaceInfo = async () => {
			const result = await loadRaceInformation({
				apiModules: this.apiModules,
				currentYear: this.currentYear,
			});
			this.currentRace = result.currentRace;
			return result;
		};
	}

	async init() {
		if (this.hasInitialized) return;

		console.log("Initializing driver selection...");
		this.isLoading = true;

		try {
			this.setupEventListeners();
			await this.checkAuthentication();

			await this.loadDrivers();
			await this.getRaceInfo();
			this.updateRaceDisplay();

			if (this.currentRace) {
				await this.loadExistingRoster();
			}

			this.startDeadlineTimer();
			this.showDriverSelection();
			this.hasInitialized = true;
		} catch (err) {
			console.error("Failed to initialize driver selection:", err);
			this.showUnauthorized();
		} finally {
			this.isLoading = false;
		}
	}

	cleanup() {
		this.stopDeadlineTimer();
		this.hasInitialized = false;
	}

	escapeHTML(unsafe) {
		if (typeof unsafe !== "string") return "";
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	formatCurrency(amount) {
		return this.authModule.formatCurrency(amount);
	}

	isValidObjectId(id) {
		return /^[0-9a-fA-F]{24}$/.test(id);
	}

	async checkAuthentication() {
		const authResult = await this.authModule.checkAuthentication();

		if (!authResult.success) {
			console.log("Authentication failed:", authResult.error);
			throw new Error("Not authenticated");
		}

		this.currentUser = authResult.user;

		if (!this.currentUser._id && !this.currentUser.id) {
			throw new Error("User ID not found in authentication data");
		}

		this.currentUser.id = this.currentUser._id || this.currentUser.id;

		console.log(
			"Driver selection authentication successful for user:",
			this.currentUser.username
		);
	}

	async loadDrivers() {
		try {
			const result = await this.apiModules.drivers.getDrivers(
				this.currentYear
			);

			if (!result.success) {
				throw new Error(result.error || "Failed to load drivers");
			}

			this.drivers = result.data.drivers || [];
			this.filteredDrivers = [...this.drivers];

			console.log(
				`Loaded ${this.drivers.length} drivers for ${this.currentYear}`
			);
		} catch (err) {
			console.error("Error loading drivers:", err);
			notificationModule.error("Failed to load drivers: " + err.message);
			throw err;
		}
	}

	async checkRaceEligibility() {
		if (!this.currentRace) {
			this.raceStatus = {
				status: "no-race",
				message: "No race available",
				canSubmit: false,
			};
			return;
		}

		try {
			const eligibilityResult =
				await this.apiModules.races.checkSubmissionEligibility(
					this.currentYear,
					this.currentRace._id
				);

			if (eligibilityResult.success) {
				const data = eligibilityResult.data;

				if (data.locked) {
					this.raceStatus = {
						status: "locked",
						message: "Race is locked by administrators",
						canSubmit: false,
						timeRemaining: 0,
					};
				} else if (data.deadlinePassed) {
					this.raceStatus = {
						status: "expired",
						message: "Submission deadline has passed",
						canSubmit: false,
						timeRemaining: 0,
					};
				} else {
					this.raceStatus = {
						status: data.deadlineSoon ? "urgent" : "open",
						message: data.deadlineSoon
							? `Deadline approaching! ${data.hoursRemaining}h remaining`
							: `${data.hoursRemaining}h until deadline`,
						canSubmit: data.eligible,
						timeRemaining: data.timeRemaining,
						hoursRemaining: data.hoursRemaining,
						deadlineSoon: data.deadlineSoon,
					};
				}
			} else {
				throw new Error(eligibilityResult.error);
			}
		} catch (error) {
			console.error("Error checking race eligibility:", error);
			this.raceStatus = {
				status: "error",
				message: "Error checking race status",
				canSubmit: false,
			};
		}

		this.updateDeadlineStatus();
	}

	async loadExistingRoster() {
		if (!this.currentRace || !this.currentUser?.id) {
			return false;
		}

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
				this.selectedDrivers = [];

				for (const driverRef of this.existingRoster.drivers) {
					const driver = this.drivers.find(
						(d) => d._id === driverRef._id
					);
					if (driver) {
						this.selectedDrivers.push(driver);
					}
				}

				this.updateTeamStats();
				this.renderDrivers();
				this.renderSelectedDrivers();

				notificationModule.info(
					`Loaded your existing team for ${this.currentRace.name}.`
				);
				return true;
			}

			this.existingRoster = null;
			return false;
		} catch (error) {
			console.error("Error loading existing roster:", error);
			notificationModule.warning("Could not load existing team.");
			return false;
		}
	}

	setupEventListeners() {
		this.setupButton("logout-btn", () => {
			this.cleanup();
			this.authModule.logout();
		});

		this.setupButton("dashboard-btn", () => {
			window.location.href = "/dashboard.html";
		});

		this.setupButton("save-team-btn", async () => {
			if (!this.canModifyRoster()) {
				notificationModule.error(this.getRosterModificationError());
				return;
			}
			await this.saveTeamWithConfirmation();
		});

		this.setupButton("clear-team-btn", () => {
			if (!this.canModifyRoster()) {
				notificationModule.error(
					`Cannot clear team: ${this.getRosterModificationError()}`
				);
				return;
			}
			this.clearTeam();
		});

		this.setupButton("refresh-race-btn", async () => {
			await this.refreshAllData();
		});

		this.setupButton("show-history-btn", async () => {
			await this.showRosterHistory();
		});

		document.querySelectorAll(".filter-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				this.setActiveFilter(e.target);
				this.filterDrivers(e.target.dataset.category);
			});
		});

		const searchInput = document.getElementById("search-drivers");
		if (searchInput) {
			searchInput.addEventListener("input", (e) => {
				this.searchDrivers(e.target.value);
			});
		}

		const sortBtn = document.getElementById("sort-by-value");
		if (sortBtn) {
			sortBtn.addEventListener("click", () => {
				this.sortByValue = !this.sortByValue;
				sortBtn.textContent = this.sortByValue
					? "Sort by Name"
					: "Sort by Value";
				this.renderDrivers();
			});
		}

		document.addEventListener("keydown", (e) => {
			this.handleKeyboardShortcuts(e);
		});

		document.addEventListener("visibilitychange", () => {
			this.handleVisibilityChange();
		});

		window.addEventListener("beforeunload", () => {
			this.cleanup();
		});

		window.addEventListener("online", () => {
			notificationModule.info("Connection restored. Refreshing data...");
			this.refreshAllData();
		});

		window.addEventListener("offline", () => {
			notificationModule.warning(
				"Connection lost. Some features may not work."
			);
		});

		console.log("Driver selection event listeners set up");
	}

	setupButton(id, handler) {
		const button = document.getElementById(id);
		if (button) {
			button.addEventListener("click", handler);
		}
	}

	handleKeyboardShortcuts(e) {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			if (this.canModifyRoster()) {
				this.saveTeamWithConfirmation();
			} else {
				notificationModule.warning(
					`Cannot save: ${this.getRosterModificationError()}`
				);
			}
		}

		if ((e.ctrlKey || e.metaKey) && e.key === "r") {
			e.preventDefault();
			if (this.canModifyRoster()) {
				this.clearTeam();
			} else {
				notificationModule.warning(
					`Cannot clear: ${this.getRosterModificationError()}`
				);
			}
		}

		if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key === "F5")) {
			e.preventDefault();
			this.refreshAllData();
		}
	}

	handleVisibilityChange() {
		if (document.hidden) {
			this.stopDeadlineTimer();
		} else {
			this.getRaceInfo()
				.then(() => {
					if (this.currentRace) {
						this.loadExistingRoster();
					}
					this.updateTeamStats();
				})
				.catch((err) => {
					console.error(
						"Error refreshing on visibility change:",
						err
					);
				});
			this.startDeadlineTimer();
		}
	}

	async refreshAllData() {
		if (this.isLoading) return;

		const loadingNotification =
			notificationModule.showLoading("Refreshing data...");
		this.isLoading = true;

		try {
			await Promise.all([
				this.loadDrivers(),
				this.getRaceInfo(),
			]);

			if (this.currentRace) {
				await this.loadExistingRoster();
			}

			this.updateTeamStats();
			this.renderDrivers();
			this.renderSelectedDrivers();

			notificationModule.success("Data refreshed successfully!");
		} catch (error) {
			console.error("Error refreshing data:", error);
			notificationModule.error(
				"Failed to refresh data: " + error.message
			);
		} finally {
			notificationModule.remove(loadingNotification);
			this.isLoading = false;
		}
	}

	setActiveFilter(activeBtn) {
		document.querySelectorAll(".filter-btn").forEach((btn) => {
			btn.classList.remove("active");
		});
		activeBtn.classList.add("active");
	}

	filterDrivers(category) {
		this.currentFilter = category;

		if (category === "all") {
			this.filteredDrivers = [...this.drivers];
		} else {
			this.filteredDrivers = this.drivers.filter(
				(driver) =>
					Array.isArray(driver.categories) &&
					driver.categories.includes(category)
			);
		}

		this.renderDrivers();
	}

	searchDrivers(query) {
		const lowerQuery = query.toLowerCase().trim();

		if (!lowerQuery) {
			this.filterDrivers(this.currentFilter);
			return;
		}

		this.filteredDrivers = this.drivers.filter((driver) => {
			const matchesSearch = driver.name
				.toLowerCase()
				.includes(lowerQuery);
			const matchesCategory =
				this.currentFilter === "all" ||
				(Array.isArray(driver.categories) &&
					driver.categories.includes(this.currentFilter));

			return matchesSearch && matchesCategory;
		});

		this.renderDrivers();
	}

	renderDrivers() {
		const driversGrid = document.getElementById("drivers-grid");
		const noDriversMessage = document.getElementById("no-drivers");

		if (!driversGrid) return;

		let driversToRender = [...this.filteredDrivers];

		if (this.sortByValue) {
			driversToRender.sort((a, b) => (b.value || 0) - (a.value || 0));
		} else {
			driversToRender.sort((a, b) =>
				(a.name || "").localeCompare(b.name || "")
			);
		}

		driversGrid.innerHTML = "";

		if (driversToRender.length === 0) {
			if (noDriversMessage) noDriversMessage.style.display = "block";
			return;
		}

		if (noDriversMessage) noDriversMessage.style.display = "none";

		driversToRender.forEach((driver) => {
			const driverCard = this.createDriverCard(driver);
			driversGrid.appendChild(driverCard);
		});
	}

	createDriverCard(driver) {
		const template = document.getElementById("driver-card-template");
		if (!template) return document.createElement("div");

		const card = template.content.cloneNode(true);

		const cardElement = card.querySelector(".driver-card");
		const categoriesContainer = card.querySelector(".driver-categories");
		const name = card.querySelector(".driver-name");
		const value = card.querySelector(".driver-value");
		const selectBtn = card.querySelector(".select-driver-btn");
		const removeBtn = card.querySelector(".remove-driver-btn");

		cardElement.dataset.driverId = driver._id || "";
		cardElement.dataset.categories = Array.isArray(driver.categories)
			? driver.categories.join(",")
			: "";
		cardElement.dataset.value = driver.value || 0;

		if (categoriesContainer) {
			categoriesContainer.innerHTML = "";
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((category) => {
					const badge = document.createElement("span");
					badge.className = "category-badge";
					badge.textContent = this.escapeHTML(category);
					categoriesContainer.appendChild(badge);
				});
			}
		}

		if (name)
			name.textContent = this.escapeHTML(driver.name || "Unknown Driver");
		if (value)
			value.textContent = `£${this.formatCurrency(driver.value || 0)}`;

		const isSelected = this.selectedDrivers.some(
			(d) => d._id === driver._id
		);
		const canAfford =
			this.currentUser &&
			this.currentUser.budget - this.getTeamValue() >=
				(driver.value || 0);
		const teamFull = this.selectedDrivers.length >= this.maxDrivers;

		if (isSelected) {
			cardElement.classList.add("selected");
			if (selectBtn) selectBtn.style.display = "none";
			if (removeBtn) removeBtn.style.display = "inline-flex";
		} else {
			cardElement.classList.remove("selected");
			if (selectBtn) selectBtn.style.display = "inline-flex";
			if (removeBtn) removeBtn.style.display = "none";

			if (!canAfford || teamFull) {
				cardElement.classList.add("disabled");
				if (selectBtn) {
					selectBtn.disabled = true;
					selectBtn.textContent = !canAfford
						? "Cannot Afford"
						: "Team Full";
				}
			} else {
				cardElement.classList.remove("disabled");
				if (selectBtn) {
					selectBtn.disabled = false;
					selectBtn.textContent = "Select Driver";
				}
			}
		}

		if (selectBtn) {
			selectBtn.addEventListener("click", () =>
				this.selectDriver(driver)
			);
		}
		if (removeBtn) {
			removeBtn.addEventListener("click", () =>
				this.removeDriver(driver._id)
			);
		}

		return card;
	}

	renderSelectedDrivers() {
		const selectedGrid = document.getElementById("selected-drivers-grid");
		const selectedSection = document.getElementById(
			"selected-drivers-section"
		);

		if (!selectedGrid || !selectedSection) return;

		if (this.selectedDrivers.length === 0) {
			selectedSection.style.display = "none";
			return;
		}

		selectedSection.style.display = "block";
		selectedGrid.innerHTML = "";

		this.selectedDrivers.forEach((driver) => {
			const driverCard = this.createSelectedDriverCard(driver);
			selectedGrid.appendChild(driverCard);
		});
	}

	createSelectedDriverCard(driver) {
		const card = document.createElement("div");
		card.className = "driver-card selected";

		const categories = Array.isArray(driver.categories)
			? driver.categories
			: [];
		const categoriesHtml = categories
			.map(
				(cat) =>
					`<span class="category-badge">${this.escapeHTML(
						cat
					)}</span>`
			)
			.join("");

		card.innerHTML = `
			<div class="driver-categories">
				${categoriesHtml}
			</div>
			<div class="driver-info">
				<h4 class="driver-name">${this.escapeHTML(driver.name || "Unknown Driver")}</h4>
				<p class="driver-value">£${this.formatCurrency(driver.value || 0)}</p>
			</div>
			<div class="driver-actions">
				<button class="btn btn-danger btn-sm remove-driver-btn">
					Remove
				</button>
			</div>
		`;

		const removeBtn = card.querySelector(".remove-driver-btn");
		if (removeBtn) {
			removeBtn.addEventListener("click", () =>
				this.removeDriver(driver._id)
			);
		}

		return card;
	}

	selectDriver(driver) {
		if (!this.canModifyRoster()) {
			notificationModule.error(
				`Cannot select drivers: ${this.getRosterModificationError()}`
			);
			return;
		}

		if (this.selectedDrivers.length >= this.maxDrivers) {
			notificationModule.warning(
				`You can only select ${this.maxDrivers} drivers.`
			);
			return;
		}

		const totalCost = this.getTeamValue() + (driver.value || 0);
		if (this.currentUser && totalCost > this.currentUser.budget) {
			notificationModule.warning(
				"Not enough budget to select this driver."
			);
			return;
		}

		if (this.selectedDrivers.some((d) => d._id === driver._id)) {
			notificationModule.warning("Driver already selected.");
			return;
		}

		this.selectedDrivers.push(driver);
		this.updateAll();
		this.showSelectionFeedback();
	}

	removeDriver(driverId) {
		if (!this.canModifyRoster()) {
			notificationModule.error(
				`Cannot remove drivers: ${this.getRosterModificationError()}`
			);
			return;
		}

		const originalLength = this.selectedDrivers.length;
		this.selectedDrivers = this.selectedDrivers.filter(
			(d) => d._id !== driverId
		);

		if (this.selectedDrivers.length < originalLength) {
			this.updateAll();
		}
	}

	updateAll() {
		this.updateTeamStats();
		this.renderDrivers();
		this.renderSelectedDrivers();
	}

	showSelectionFeedback() {
		const validation = this.validateTeamComposition();

		if (this.selectedDrivers.length > 0) {
			if (validation.valid) {
				if (this.selectedDrivers.length === this.maxDrivers) {
					notificationModule.success(
						"Team is complete and ready to submit!"
					);
				} else {
					notificationModule.info(
						`Team valid but incomplete. Add ${
							this.maxDrivers - this.selectedDrivers.length
						} more driver(s) for a full team.`
					);
				}
			} else {
				const filteredErrors = validation.errors.filter(
					(error) => !error.includes("Must have exactly")
				);
				if (filteredErrors.length > 0) {
					notificationModule.warning(filteredErrors[0]);
				}
			}
		}
	}

	updateTeamStats() {
		const teamValue = this.getTeamValue();
		const budgetRemaining = this.currentUser
			? this.currentUser.budget - teamValue
			: 0;
		const selectedCount = this.selectedDrivers.length;

		this.updateElement("selected-count", selectedCount);
		this.updateElement(
			"budget-remaining",
			this.formatCurrency(budgetRemaining)
		);
		this.updateElement("team-value", this.formatCurrency(teamValue));
		this.updateElement("budget-used", this.formatCurrency(teamValue));

		this.updateSaveButton(selectedCount);
	}

	updateElement(id, value) {
		const element = document.getElementById(id);
		if (element) {
			element.textContent = value;
		}
	}

	updateSaveButton(selectedCount) {
		const saveBtn = document.getElementById("save-team-btn");
		if (!saveBtn) return;

		const validation = this.validateTeamComposition();
		const canSave = validation.valid && this.canModifyRoster();

		saveBtn.disabled = !canSave;

		if (!this.currentRace) {
			saveBtn.textContent = "No Race Available";
		} else if (!this.raceStatus?.canSubmit) {
			saveBtn.textContent = this.getRaceStatusButtonText();
		} else if (selectedCount === 0) {
			saveBtn.textContent = "Select Drivers First";
		} else if (selectedCount < this.maxDrivers) {
			const remaining = this.maxDrivers - selectedCount;
			saveBtn.textContent = `Select ${remaining} More Driver${
				remaining !== 1 ? "s" : ""
			}`;
		} else if (!validation.valid) {
			saveBtn.textContent = "Fix Team Issues";
		} else {
			const isUpdate = this.existingRoster !== null;
			saveBtn.textContent = isUpdate ? "Update Team" : "Save Team";
		}
	}

	getRaceStatusButtonText() {
		switch (this.raceStatus?.status) {
			case "expired":
				return "Deadline Passed";
			case "locked":
				return "Race Locked";
			default:
				return "Cannot Submit";
		}
	}

	getTeamValue() {
		return this.selectedDrivers.reduce(
			(total, driver) => total + (driver.value || 0),
			0
		);
	}

	clearTeam() {
		if (this.selectedDrivers.length === 0) {
			notificationModule.info("No drivers selected to clear.");
			return;
		}

		if (!this.canModifyRoster()) {
			notificationModule.error(
				`Cannot clear team: ${this.getRosterModificationError()}`
			);
			return;
		}

		let confirmMessage =
			"Are you sure you want to clear your current team selection?";

		if (this.existingRoster) {
			confirmMessage +=
				"\n\nNote: This will not affect your already submitted roster until you save changes.";
		}

		if (!confirm(confirmMessage)) {
			return;
		}

		this.selectedDrivers = [];
		this.updateAll();
		notificationModule.info("Team selection cleared.");
	}

	updateRaceDisplay() {
		const elements = {
			raceInfo: document.getElementById("current-race-info"),
			raceName: document.getElementById("current-race-name"),
			raceRound: document.getElementById("current-race-round"),
			raceLocation: document.getElementById("current-race-location"),
			raceDeadline: document.getElementById("race-deadline"),
		};

		if (!this.currentRace) {
			if (elements.raceInfo) elements.raceInfo.style.display = "none";
			return;
		}

		if (elements.raceInfo) elements.raceInfo.style.display = "block";
		if (elements.raceName)
			elements.raceName.textContent =
				this.currentRace.name || "Unknown Race";
		if (elements.raceRound)
			elements.raceRound.textContent = `Round ${
				this.currentRace.roundNumber || "TBA"
			}`;
		if (elements.raceLocation)
			elements.raceLocation.textContent =
				this.currentRace.location || "TBA";

		if (elements.raceDeadline && this.currentRace.submissionDeadline) {
			const deadline = new Date(this.currentRace.submissionDeadline);
			elements.raceDeadline.textContent = deadline.toLocaleString(
				"en-GB",
				{
					timeZone: "UTC",
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				}
			);
		}

		this.updateDeadlineStatus();
	}

	updateDeadlineStatus() {
		const raceStatusEl = document.getElementById("race-status");
		const deadlineWarningEl = document.getElementById("deadline-warning");

		if (!this.raceStatus) return;

		if (raceStatusEl) {
			raceStatusEl.textContent = this.raceStatus.message;
			raceStatusEl.className = `race-status ${this.raceStatus.status}`;
		}

		if (deadlineWarningEl) {
			this.updateDeadlineWarning(deadlineWarningEl);
		}
	}

	updateDeadlineWarning(element) {
		const warningConfigs = {
			urgent: {
				display: true,
				className: "deadline-warning urgent",
				html: `
					<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
					<span>Hurry! Deadline approaching soon</span>
				`,
			},
			expired: {
				display: true,
				className: "deadline-warning expired",
				html: `
					<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
					<span>Submissions are closed for this race</span>
				`,
			},
		};

		const config = warningConfigs[this.raceStatus.status];

		if (config) {
			element.style.display = "block";
			element.className = config.className;
			element.innerHTML = config.html;
		} else {
			element.style.display = "none";
		}
	}

	async getUserRosterHistory() {
		if (!this.currentUser?.id) return [];

		try {
			const result = await this.apiModules.rosters.getUserRosters(
				this.currentYear,
				this.currentUser.id
			);

			return result.success ? result.data.rosters || [] : [];
		} catch (error) {
			console.error("Error loading roster history:", error);
			return [];
		}
	}

	async showRosterHistory() {
		try {
			const rosters = await this.getUserRosterHistory();

			if (rosters.length === 0) {
				notificationModule.info(
					"No roster history found for this year."
				);
				return;
			}

			console.log("Roster History:", rosters);
			notificationModule.info(
				`Found ${rosters.length} previous roster(s). Check console for details.`
			);
		} catch (error) {
			console.error("Error showing roster history:", error);
			notificationModule.error("Failed to load roster history");
		}
	}

	validateTeamComposition() {
		const errors = [];

		if (!this.currentRace) {
			errors.push("No race available for submissions");
		} else if (!this.raceStatus?.canSubmit) {
			errors.push(
				this.raceStatus?.message || "Cannot submit for this race"
			);
		}

		if (this.selectedDrivers.length > this.maxDrivers) {
			errors.push(
				`Team cannot have more than ${this.maxDrivers} drivers (currently has ${this.selectedDrivers.length})`
			);
		}

		const teamValue = this.getTeamValue();
		if (this.currentUser && teamValue > this.currentUser.budget) {
			errors.push(
				`Team value (£${this.formatCurrency(
					teamValue
				)}) exceeds budget (£${this.formatCurrency(
					this.currentUser.budget
				)})`
			);
		}

		if (!this.hasRequiredCategories()) {
			const missing = this.getMissingCategories();
			errors.push(
				`Team missing required categories: ${missing.join(", ")}`
			);
		}

		const driverIds = this.selectedDrivers.map((d) => d._id);
		const uniqueIds = new Set(driverIds);
		if (driverIds.length !== uniqueIds.size) {
			errors.push("Team contains duplicate drivers");
		}

		return {
			valid: errors.length === 0,
			errors: errors,
		};
	}

	hasRequiredCategories() {
		const required = ["M", "JS", "I"];
		const present = new Set();

		for (const driver of this.selectedDrivers) {
			if (Array.isArray(driver.categories)) {
				for (const cat of driver.categories) {
					if (required.includes(cat)) {
						present.add(cat);
					}
				}
			}
		}

		return required.every((cat) => present.has(cat));
	}

	getMissingCategories() {
		const required = new Set(["M", "JS", "I"]);
		const found = new Set();

		this.selectedDrivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((cat) => {
					if (required.has(cat)) {
						found.add(cat);
					}
				});
			}
		});

		return [...required].filter((cat) => !found.has(cat));
	}

	getSelectedCategories() {
		const categories = new Set();
		this.selectedDrivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((cat) => categories.add(cat));
			}
		});
		return Array.from(categories).sort();
	}

	getTeamSummary() {
		const teamValue = this.getTeamValue();
		const budgetRemaining = this.currentUser
			? this.currentUser.budget - teamValue
			: 0;

		return {
			race: this.currentRace
				? {
						name: this.currentRace.name,
						round: this.currentRace.roundNumber,
						location: this.currentRace.location,
						deadline: new Date(
							this.currentRace.submissionDeadline
						).toLocaleString("en-GB", {
							timeZone: "UTC",
							year: "numeric",
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						}),
				  }
				: null,
			drivers: this.selectedDrivers.map((driver) => ({
				name: driver.name,
				value: driver.value,
				categories: Array.isArray(driver.categories)
					? driver.categories.join(", ")
					: "",
			})),
			totalDrivers: this.selectedDrivers.length,
			totalValue: teamValue,
			budgetUsed: teamValue,
			budgetRemaining: budgetRemaining,
			categories: this.getSelectedCategories(),
			isUpdate: this.existingRoster !== null,
		};
	}

	async saveTeam() {
		if (!this.currentRace) {
			notificationModule.error("No race available for submissions");
			return false;
		}

		if (!this.currentUser?.id) {
			notificationModule.error("User information not available");
			return false;
		}

		if (!this.raceStatus?.canSubmit) {
			notificationModule.error(
				this.raceStatus?.message || "Cannot submit for this race"
			);
			return false;
		}

		if (this.selectedDrivers.length === 0) {
			notificationModule.warning(
				"Please select at least one driver before saving."
			);
			return false;
		}

		const teamValue = this.getTeamValue();
		if (this.currentUser && teamValue > this.currentUser.budget) {
			notificationModule.error("Team value exceeds your budget.");
			return false;
		}

		if (!this.hasRequiredCategories()) {
			const missing = this.getMissingCategories();
			notificationModule.error(
				`Your team is missing drivers from required categories: ${missing.join(
					", "
				)}`
			);
			return false;
		}

		try {
			const loadingNotification = notificationModule.showLoading(
				"Saving your team..."
			);

			const rosterData = {
				user: this.currentUser.id,
				drivers: this.selectedDrivers.map((driver) => driver._id),
				budgetUsed: teamValue,
				pointsEarned: 0,
				race: this.currentRace._id,
			};

			let result;
			if (this.existingRoster) {
				result = await this.apiModules.rosters.updateRoster(
					this.currentYear,
					this.existingRoster._id,
					rosterData
				);
			} else {
				result = await this.apiModules.rosters.createRoster(
					this.currentYear,
					rosterData
				);
			}

			notificationModule.remove(loadingNotification);

			if (!result.success) {
				throw new Error(result.error || "Failed to save roster");
			}

			const actionText = this.existingRoster ? "updated" : "saved";
			notificationModule.success(
				`Team ${actionText} successfully for ${this.currentRace.name}!`,
				{ duration: 3000 }
			);

			this.existingRoster = result.data.roster;
			this.updateSaveButtonSuccess(actionText);

			setTimeout(() => {
				const shouldRedirect = confirm(
					`Team ${actionText} successfully for ${this.currentRace.name}! Would you like to go to the dashboard?`
				);
				if (shouldRedirect) {
					window.location.href = "/dashboard.html";
				}
			}, 2000);

			return true;
		} catch (error) {
			console.error("Error saving team:", error);
			this.handleRosterError(error);
			return false;
		}
	}

	updateSaveButtonSuccess(actionText) {
		const saveBtn = document.getElementById("save-team-btn");
		if (saveBtn) {
			saveBtn.textContent = "Team Saved!";
			saveBtn.classList.add("btn-success");
			saveBtn.disabled = true;

			setTimeout(() => {
				saveBtn.textContent = "Update Team";
				saveBtn.classList.remove("btn-success");
				saveBtn.disabled = !this.raceStatus?.canSubmit;
			}, 3000);
		}
	}

	async saveTeamWithConfirmation() {
		const validation = this.validateTeamComposition();
		if (!validation.valid) {
			notificationModule.error("Team validation failed:");
			validation.errors.forEach((error) => {
				notificationModule.error(error, { duration: 7000 });
			});
			return;
		}

		const summary = this.getTeamSummary();
		const confirmMessage = this.buildConfirmationMessage(summary);

		if (!confirm(confirmMessage.trim())) {
			return;
		}

		await this.saveTeam();
	}

	buildConfirmationMessage(summary) {
		let message = `Are you sure you want to ${
			summary.isUpdate ? "update" : "save"
		} this team?`;

		if (summary.race) {
			message += `\n\nRace: ${summary.race.name} (Round ${summary.race.round})`;
			if (summary.race.location) {
				message += `\nLocation: ${summary.race.location}`;
			}
			message += `\nDeadline: ${summary.race.deadline}`;
		}

		message += `\n\nDrivers: ${summary.drivers
			.map((d) => d.name)
			.join(", ")}`;
		message += `\nTotal Value: £${this.formatCurrency(summary.totalValue)}`;
		message += `\nBudget Remaining: £${this.formatCurrency(
			summary.budgetRemaining
		)}`;
		message += `\nCategories: ${summary.categories.join(", ")}`;

		return message;
	}

	handleRosterError(error) {
		const errorMessage = error.message.toLowerCase();

		if (errorMessage.includes("deadline")) {
			notificationModule.error(
				"Submission deadline has passed for this race."
			);
			this.getRaceInfo();
		} else if (errorMessage.includes("locked")) {
			notificationModule.error(
				"This race has been locked by administrators."
			);
			this.getRaceInfo();
		} else if (errorMessage.includes("budget")) {
			notificationModule.error(
				"Team value exceeds your available budget."
			);
		} else if (errorMessage.includes("driver")) {
			notificationModule.error(
				"One or more selected drivers are invalid. Please refresh and try again."
			);
		} else if (errorMessage.includes("race")) {
			notificationModule.error(
				"Race information is invalid. Please refresh the page."
			);
			this.getRaceInfo();
		} else {
			notificationModule.error(
				"An unexpected error occurred. Please try again."
			);
		}
	}

	startDeadlineTimer() {
		this.stopDeadlineTimer();
		this.deadlineTimer = setInterval(() => {
			if (this.currentRace && this.raceStatus) {
				this.checkRaceEligibility();
			}
		}, 60000);
	}

	stopDeadlineTimer() {
		if (this.deadlineTimer) {
			clearInterval(this.deadlineTimer);
			this.deadlineTimer = null;
		}
	}

	canModifyRoster() {
		return this.currentRace && this.raceStatus?.canSubmit;
	}

	getRosterModificationError() {
		if (!this.currentRace) {
			return "No race available";
		}

		if (!this.raceStatus) {
			return "Race status unknown";
		}

		switch (this.raceStatus.status) {
			case "locked":
				return "Race is locked by administrators";
			case "expired":
				return "Submission deadline has passed";
			case "error":
				return "Error loading race information";
			case "no-race":
				return "No race available for submissions";
			default:
				return "Cannot modify roster at this time";
		}
	}

	showDriverSelection() {
		const loading = document.getElementById("loading");
		const unauthorized = document.getElementById("unauthorized");
		const driverSelection = document.getElementById("driver-selection");

		if (loading) loading.style.display = "none";
		if (unauthorized) unauthorized.style.display = "none";
		if (driverSelection) driverSelection.style.display = "block";

		try {
			this.updateUserInfo();
			this.renderDrivers();
			this.updateTeamStats();
			console.log("Driver selection displayed successfully");
		} catch (error) {
			console.error("Error showing driver selection:", error);
		}
	}

	showUnauthorized() {
		const loading = document.getElementById("loading");
		const driverSelection = document.getElementById("driver-selection");
		const unauthorized = document.getElementById("unauthorized");

		if (loading) loading.style.display = "none";
		if (driverSelection) driverSelection.style.display = "none";
		if (unauthorized) unauthorized.style.display = "block";
	}

	updateUserInfo() {
		if (!this.currentUser) return;

		this.authModule.updateBudgetDisplays(this.currentUser.budget);
		console.log(
			"User info updated for driver selection:",
			this.currentUser.username
		);
	}

	getCurrentUser() {
		return this.currentUser;
	}

	getSelectedDrivers() {
		return [...this.selectedDrivers];
	}

	getAvailableDrivers() {
		return this.drivers.filter(
			(driver) =>
				!this.selectedDrivers.some(
					(selected) => selected._id === driver._id
				)
		);
	}

	getCurrentRace() {
		return this.currentRace;
	}

	getRaceStatus() {
		return this.raceStatus;
	}

	isInitialized() {
		return this.hasInitialized;
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
