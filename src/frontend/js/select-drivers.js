import authModule from "./modules/auth.js";
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
		this.currentRace = null || 'None';
		this.raceDeadlinePassed = false;
		this.existingRoster = null;
	}

	async init() {
		console.log("Initializing driver selection...");

		try {
			this.setupEventListeners();
			await this.checkAuthentication();
			await this.loadDrivers();
			await this.loadNextRace();
			await this.loadNextRace();

			if (this.currentRace) {
				await this.loadExistingRoster();
			}

			this.startDeadlineTimer();

			this.showDriverSelection();
		} catch (err) {
			console.error("Failed to initialize driver selection:", err);
			this.showUnauthorized();
		}
	}

	cleanup() {
		this.stopDeadlineTimer();
	}

	escapeHTML(unsafe) {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	async checkAuthentication() {
		const authResult = await authModule.checkAuthentication();

		if (!authResult.success) {
			console.log("Authentication failed:", authResult.error);
			throw new Error("Not authenticated");
		}

		this.currentUser = authResult.user;
		console.log("Driver selection authentication successful");
	}

	async loadDrivers() {
		try {
			const result = await this.apiModules.drivers.getDrivers(
				this.currentYear
			);

			if (!result.success) throw new Error(result.error);

			this.drivers = result.data.drivers || [];
			this.filteredDrivers = [...this.drivers];
			console.log(`Loaded ${this.drivers.length} drivers`);
		} catch (err) {
			console.error("Error loading drivers:", err);
			notificationModule.error("Failed to load drivers");
			throw err;
		}
	}

	async getUserRosterHistory() {
		try {
			const result = await this.apiModules.rosters.getUserRosters(
				this.currentYear,
				this.currentUser._id
			);

			if (result.success) {
				return result.data.rosters || [];
			}
			return [];
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
			const historyHtml = rosters
				.map(
					(roster) => `
			<div class="roster-history-item">
				<div class="roster-race-info">
					<h4>${roster.race.name}</h4>
					<p>Round ${roster.race.roundNumber} • ${roster.race.location || "TBA"}</p>
				</div>
				<div class="roster-stats">
					<span>Budget Used: £${this.authModule.formatCurrency(roster.budgetUsed)}</span>
					<span>Points Earned: ${roster.pointsEarned}</span>
				</div>
				<div class="roster-drivers">
					<strong>Drivers:</strong> ${roster.drivers.map((d) => d.name).join(", ")}
				</div>
				<div class="roster-date">
					Submitted: ${new Date(roster.createdAt).toLocaleString()}
				</div>
			</div>
		`
				)
				.join("");

			console.log("Roster History:", rosters);
			notificationModule.info(
				`Found ${rosters.length} previous roster(s). Check console for details.`
			);
		} catch (error) {
			console.error("Error showing roster history:", error);
			notificationModule.error("Failed to load roster history");
		}
	}

	setupEventListeners() {
		const logoutBtn = document.getElementById("logout-btn");
		if (logoutBtn) {
			logoutBtn.addEventListener("click", () => {
				this.cleanup();
				authModule.logout();
			});
		}

		const dashboardBtn = document.getElementById("dashboard-btn");
		if (dashboardBtn) {
			dashboardBtn.addEventListener("click", () => {
				window.location.href = "/dashboard.html";
			});
		}

		const saveTeamBtn = document.getElementById("save-team-btn");
		if (saveTeamBtn) {
			saveTeamBtn.addEventListener("click", async () => {
				const modifyCheck = this.canModifyRoster();
				if (!modifyCheck.canModify) {
					notificationModule.error(modifyCheck.reason);
					return;
				}
				await this.saveTeamWithConfirmation();
			});
		}

		const clearTeamBtn = document.getElementById("clear-team-btn");
		if (clearTeamBtn) {
			clearTeamBtn.addEventListener("click", () => {
				const modifyCheck = this.canModifyRoster();
				if (!modifyCheck.canModify) {
					notificationModule.error(
						`Cannot clear team: ${modifyCheck.reason}`
					);
					return;
				}
				this.clearTeam();
			});
		}

		const refreshRaceBtn = document.getElementById("refresh-race-btn");
		if (refreshRaceBtn) {
			refreshRaceBtn.addEventListener("click", async () => {
				await this.refreshAllData();
			});
		}

		const historyBtn = document.getElementById("show-history-btn");
		if (historyBtn) {
			historyBtn.addEventListener("click", async () => {
				await this.showRosterHistory();
			});
		}

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
			const modifyCheck = this.canModifyRoster();

			if ((e.ctrlKey || e.metaKey) && e.key === "s") {
				e.preventDefault();
				if (modifyCheck.canModify) {
					this.saveTeamWithConfirmation();
				} else {
					notificationModule.warning(
						`Cannot save: ${modifyCheck.reason}`
					);
				}
			}

			if ((e.ctrlKey || e.metaKey) && e.key === "r") {
				e.preventDefault();
				if (modifyCheck.canModify) {
					this.clearTeam();
				} else {
					notificationModule.warning(
						`Cannot clear: ${modifyCheck.reason}`
					);
				}
			}

			if ((e.ctrlKey || e.metaKey) && e.key === "o") {
				e.preventDefault();
				if (modifyCheck.canModify) {
					this.optimizeTeamSelection();
				} else {
					notificationModule.warning(
						`Cannot optimize: ${modifyCheck.reason}`
					);
				}
			}

			if (
				e.key === "F5" ||
				((e.ctrlKey || e.metaKey) && e.key === "F5")
			) {
				e.preventDefault();
				this.refreshAllData();
			}
		});

		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				this.stopDeadlineTimer();
			} else {
				this.loadNextRace().then(() => {
					if (this.currentRace) {
						this.loadExistingRoster();
					}
					this.updateTeamStats();
				});
				this.startDeadlineTimer();
			}
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

		console.log(
			"Driver selection event listeners set up with race integration"
		);
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
			this.filteredDrivers = this.drivers.filter((driver) =>
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
				driver.categories.includes(this.currentFilter);

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
			driversToRender.sort((a, b) => Number(b.value) - Number(a.value));
		} else {
			driversToRender.sort((a, b) => a.name.localeCompare(b.name));
		}

		driversGrid.innerHTML = "";

		if (driversToRender.length === 0) {
			noDriversMessage.style.display = "block";
			return;
		}

		noDriversMessage.style.display = "none";

		driversToRender.forEach((driver) => {
			const driverCard = this.createDriverCard(driver);
			driversGrid.appendChild(driverCard);
		});
	}

	createDriverCard(driver) {
		const template = document.getElementById("driver-card-template");
		const card = template.content.cloneNode(true);

		const cardElement = card.querySelector(".driver-card");
		const categoriesContainer = card.querySelector(".driver-categories");
		const name = card.querySelector(".driver-name");
		const value = card.querySelector(".driver-value");
		const selectBtn = card.querySelector(".select-driver-btn");
		const removeBtn = card.querySelector(".remove-driver-btn");

		cardElement.dataset.driverId = driver._id;
		cardElement.dataset.categories = driver.categories.join(",");
		cardElement.dataset.value = driver.value;

		categoriesContainer.innerHTML = "";
		driver.categories.forEach((category) => {
			const badge = document.createElement("span");
			badge.className = "category-badge";
			badge.textContent = category;
			categoriesContainer.appendChild(badge);
		});

		name.textContent = driver.name;
		value.textContent = `£${authModule.formatCurrency(driver.value)}`;

		const isSelected = this.selectedDrivers.some(
			(d) => d._id === driver._id
		);
		const canAfford =
			this.currentUser.budget - this.getTeamValue() >= driver.value;
		const teamFull = this.selectedDrivers.length >= this.maxDrivers;

		if (isSelected) {
			cardElement.classList.add("selected");
			selectBtn.style.display = "none";
			removeBtn.style.display = "inline-flex";
		} else {
			cardElement.classList.remove("selected");
			selectBtn.style.display = "inline-flex";
			removeBtn.style.display = "none";

			if (!canAfford || teamFull) {
				cardElement.classList.add("disabled");
				selectBtn.disabled = true;
				selectBtn.textContent = !canAfford
					? "Cannot Afford"
					: "Team Full";
			} else {
				cardElement.classList.remove("disabled");
				selectBtn.disabled = false;
				selectBtn.textContent = "Select Driver";
			}
		}

		selectBtn.addEventListener("click", () => this.selectDriver(driver));
		removeBtn.addEventListener("click", () =>
			this.removeDriver(driver._id)
		);

		return card;
	}

	selectDriver(driver) {
		const modifyCheck = this.canModifyRoster();
		if (!modifyCheck.canModify) {
			notificationModule.error(
				`Cannot select drivers: ${modifyCheck.reason}`
			);
			return;
		}

		if (this.selectedDrivers.length >= this.maxDrivers) {
			notificationModule.warning(
				`You can only select ${this.maxDrivers} drivers.`
			);
			return;
		}

		const totalCost = this.getTeamValue() + driver.value;
		if (totalCost > this.currentUser.budget) {
			notificationModule.warning(
				"Not enough budget to select this driver."
			);
			return;
		}

		this.selectedDrivers.push(driver);
		this.updateTeamStats();
		this.renderDrivers();
		this.renderSelectedDrivers();

		const validation = this.validateDriversForRace();
		if (this.selectedDrivers.length === this.maxDrivers) {
			if (validation.valid) {
				notificationModule.success(
					"Team is complete and ready to submit!"
				);
			} else {
				notificationModule.warning(
					`Team complete but has issues: ${validation.errors.join(
						", "
					)}`
				);
			}
		} else if (validation.errors.length > 0) {
			const relevantErrors = validation.errors.filter(
				(error) => !error.includes("Must select exactly")
			);
			if (relevantErrors.length > 0) {
				notificationModule.warning(relevantErrors[0]);
			}
		}
	}

	removeDriver(driverId) {
		const modifyCheck = this.canModifyRoster();
		if (!modifyCheck.canModify) {
			notificationModule.error(
				`Cannot remove drivers: ${modifyCheck.reason}`
			);
			return;
		}

		this.selectedDrivers = this.selectedDrivers.filter(
			(d) => d._id !== driverId
		);
		this.updateTeamStats();
		this.renderDrivers();
		this.renderSelectedDrivers();
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
		card.innerHTML = `
            <div class="driver-categories">
                ${driver.categories
					.map(
						(cat) =>
							`<span class="category-badge">${this.escapeHTML(
								cat
							)}</span>`
					)
					.join("")}
            </div>
            <div class="driver-info">
                <h4 class="driver-name">${this.escapeHTML(driver.name)}</h4>
                <p class="driver-value">£${this.escapeHTML(
					authModule.formatCurrency(driver.value)
				)}</p>
            </div>
            <div class="driver-actions">
                <button class="btn btn-danger btn-sm remove-driver-btn">
                    Remove
                </button>
            </div>
        `;

		const removeBtn = card.querySelector(".remove-driver-btn");
		removeBtn.addEventListener("click", () =>
			this.removeDriver(driver._id)
		);

		return card;
	}

	updateTeamStats() {
		const teamValue = this.getTeamValue();
		const budgetRemaining = this.currentUser.budget - teamValue;
		const selectedCount = this.selectedDrivers.length;
		const isComplete = selectedCount <= this.maxDrivers;

		document.getElementById("selected-count").textContent = selectedCount;
		document.getElementById("budget-remaining").textContent =
			authModule.formatCurrency(budgetRemaining);
		document.getElementById("team-value").textContent =
			authModule.formatCurrency(teamValue);
		document.getElementById("budget-used").textContent =
			authModule.formatCurrency(teamValue);

		const saveBtn = document.getElementById("save-team-btn");
		if (saveBtn) {
			const hasAllCategories = this.hasRequiredCategories();
			saveBtn.disabled = !(isComplete && hasAllCategories);
		}
	}

	getTeamValue() {
		return this.selectedDrivers.reduce(
			(total, driver) => total + driver.value,
			0
		);
	}

	clearTeam() {
		if (this.selectedDrivers.length === 0) {
			notificationModule.info("No drivers selected to clear.");
			return;
		}

		const modifyCheck = this.canModifyRoster();
		if (!modifyCheck.canModify) {
			notificationModule.error(
				`Cannot clear team: ${modifyCheck.reason}`
			);
			return;
		}

		let confirmMessage =
			"Are you sure you want to clear your current team selection?";

		if (this.existingRoster) {
			confirmMessage +=
				"\n\nNote: This will not affect your already submitted roster until you save changes.";
		}

		const confirmed = confirm(confirmMessage);
		if (!confirmed) {
			return;
		}

		this.selectedDrivers = [];
		this.updateTeamStats();
		this.renderDrivers();
		this.renderSelectedDrivers();

		const saveBtn = document.getElementById("save-team-btn");
		if (saveBtn && !this.raceDeadlinePassed) {
			if (this.existingRoster) {
				saveBtn.textContent = "Update Team";
			} else {
				saveBtn.textContent = "Save Team";
			}
		}

		notificationModule.info("Team selection cleared.");
	}

	async loadNextRace() {
		try {
			const now = new Date();

			let result = await this.apiModules.races.getCurrentRace(this.currentYear);

			let races = result.success ? result.data.races : [];

			if (!races || races.length === 0) {
				const allRacesResult = await this.apiModules.races.getRaces(
					this.currentYear,
					{
						order: "asc",
					}
				);
				races = allRacesResult.success ? allRacesResult.data.races : [];
			}

			this.currentRace = races.find((race) => {
				if (!race.events || race.events.length === 0) return false;

				const sortedEvents = race.events
					.map((e) => ({ ...e, time: new Date(e.time) }))

				const lastEventTime =
					sortedEvents[sortedEvents.length - 1].time;

				return lastEventTime > now && !race.isLocked;
			});

			this.updateRaceDisplay();

			if (this.currentRace) {
				this.checkRaceDeadline();
			}

			return this.currentRace || null;
		} catch (error) {
			console.error("Error loading next race:", error);
			notificationModule.error("Failed to load race information");
			this.currentRace = null;
			this.updateRaceDisplay();
			return null;
		}
	}

	checkRaceDeadline() {
		if (!this.currentRace) {
			this.raceDeadlinePassed = true;
			return;
		}

		const now = new Date();
		const deadline = new Date(this.currentRace.submissionDeadline);
		this.raceDeadlinePassed = now > deadline;

		this.updateDeadlineStatus();
	}

	checkRaceDeadline() {
		if (!this.currentRace) {
			this.raceDeadlinePassed = true;
			return;
		}

		const now = new Date();
		const deadline = new Date(this.currentRace.submissionDeadline);
		this.raceDeadlinePassed = now > deadline;

		this.updateDeadlineStatus();
	}

	updateRaceDisplay() {
		const raceInfoEl = document.getElementById("current-race-info");
		const raceNameEl = document.getElementById("current-race-name");
		const raceRoundEl = document.getElementById("current-race-round");
		const raceLocationEl = document.getElementById("current-race-location");
		const raceDeadlineEl = document.getElementById("race-deadline");
		const raceStatusEl = document.getElementById("race-status");

		if (!this.currentRace) {
			if (raceInfoEl) raceInfoEl.style.display = "none";
			if (raceStatusEl) {
				raceStatusEl.textContent = "No races available for submissions";
				raceStatusEl.className = "race-status unavailable";
			}
			return;
		}

		if (raceInfoEl) raceInfoEl.style.display = "block";
		if (raceNameEl) raceNameEl.textContent = this.currentRace.name;
		if (raceRoundEl)
			raceRoundEl.textContent = `Round ${this.currentRace.roundNumber}`;
		if (raceLocationEl)
			raceLocationEl.textContent = this.currentRace.location || "TBA";

		if (raceDeadlineEl) {
			const deadline = new Date(this.currentRace.submissionDeadline);
			raceDeadlineEl.textContent = deadline.toLocaleString();
		}

		this.updateDeadlineStatus();
	}

	updateDeadlineStatus() {
		const raceStatusEl = document.getElementById("race-status");
		const deadlineWarningEl = document.getElementById("deadline-warning");

		if (!this.currentRace) return;

		const now = new Date();
		const deadline = new Date(this.currentRace.submissionDeadline);
		const timeUntilDeadline = deadline - now;
		const hoursUntilDeadline = timeUntilDeadline / (1000 * 60 * 60);

		if (this.raceDeadlinePassed) {
			if (raceStatusEl) {
				raceStatusEl.textContent = "Submission deadline has passed";
				raceStatusEl.className = "race-status expired";
			}
			if (deadlineWarningEl) {
				deadlineWarningEl.style.display = "block";
				deadlineWarningEl.className = "deadline-warning expired";
				deadlineWarningEl.innerHTML = `
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<span>Submissions are closed for this race</span>
			`;
			}
		} else if (hoursUntilDeadline <= 24) {
			if (raceStatusEl) {
				raceStatusEl.textContent = `Deadline in ${Math.floor(
					hoursUntilDeadline
				)}h ${Math.floor(
					(timeUntilDeadline % (1000 * 60 * 60)) / (1000 * 60)
				)}m`;
				raceStatusEl.className = "race-status urgent";
			}
			if (deadlineWarningEl) {
				deadlineWarningEl.style.display = "block";
				deadlineWarningEl.className = "deadline-warning urgent";
				deadlineWarningEl.innerHTML = `
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<span>Hurry! Deadline approaching in less than 24 hours</span>
			`;
			}
		} else {
			if (raceStatusEl) {
				const days = Math.floor(hoursUntilDeadline / 24);
				const hours = Math.floor(hoursUntilDeadline % 24);
				raceStatusEl.textContent = `${days}d ${hours}h until deadline`;
				raceStatusEl.className = "race-status open";
			}
			if (deadlineWarningEl) {
				deadlineWarningEl.style.display = "none";
			}
		}
	}

	getRosterStatus() {
		if (!this.currentRace) {
			return {
				status: "no-race",
				message: "No race available for submissions",
				canSubmit: false,
			};
		}

		if (this.raceDeadlinePassed) {
			return {
				status: "expired",
				message: "Submission deadline has passed",
				canSubmit: false,
			};
		}

		if (this.existingRoster) {
			return {
				status: "existing",
				message: `You have already submitted a team for ${this.currentRace.name}`,
				canSubmit: true,
				action: "update",
			};
		}

		return {
			status: "new",
			message: `Ready to submit team for ${this.currentRace.name}`,
			canSubmit: true,
			action: "create",
		};
	}

	handleRosterError(error) {
		const errorMessage = error.message.toLowerCase();

		if (errorMessage.includes("deadline")) {
			notificationModule.error(
				"Submission deadline has passed for this race."
			);
			this.checkRaceDeadline();
		} else if (errorMessage.includes("locked")) {
			notificationModule.error(
				"This race has been locked by administrators."
			);
			this.loadNextRace();
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
			this.loadNextRace();
		} else {
			notificationModule.error(
				"An unexpected error occurred. Please try again."
			);
		}
	}

	async loadExistingRoster() {
		if (!this.currentRace) {
			return false;
		}

		try {
			const result = await this.apiModules.rosters.getRosters(
				this.currentYear,
				{
					user: this.currentUser._id,
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

				const saveBtn = document.getElementById("save-team-btn");
				if (saveBtn && !this.raceDeadlinePassed) {
					saveBtn.textContent = "Update Team";
				}

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

	validateTeamComposition() {
		const errors = [];

		if (!this.currentRace) {
			errors.push("No race available for submissions");
		} else if (this.raceDeadlinePassed) {
			errors.push("Submission deadline has passed for this race");
		}

		if (this.selectedDrivers.length !== this.maxDrivers) {
			errors.push(
				`Team must have exactly ${this.maxDrivers} drivers (currently has ${this.selectedDrivers.length})`
			);
		}

		const teamValue = this.getTeamValue();
		if (teamValue > this.currentUser.budget) {
			errors.push(
				`Team value (£${authModule.formatCurrency(
					teamValue
				)}) exceeds budget (£${authModule.formatCurrency(
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

	getTeamSummary() {
		const teamValue = this.getTeamValue();
		const budgetRemaining = this.currentUser.budget - teamValue;

		return {
			race: this.currentRace
				? {
						name: this.currentRace.name,
						round: this.currentRace.roundNumber,
						location: this.currentRace.location,
						deadline: new Date(
							this.currentRace.submissionDeadline
						).toLocaleString(),
				  }
				: null,
			drivers: this.selectedDrivers.map((driver) => ({
				name: driver.name,
				value: driver.value,
				categories: driver.categories.join(", "),
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

		if (this.raceDeadlinePassed) {
			notificationModule.error(
				"Submission deadline has passed for this race"
			);
			return false;
		}

		if (this.selectedDrivers.length !== this.maxDrivers) {
			notificationModule.warning(
				`Please select exactly ${this.maxDrivers} drivers before saving.`
			);
			return false;
		}

		const teamValue = this.getTeamValue();
		if (teamValue > this.currentUser.budget) {
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
				user: this.currentUser._id,
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
				{
					duration: 3000,
				}
			);

			this.existingRoster = result.data.roster;

			const saveBtn = document.getElementById("save-team-btn");
			if (saveBtn) {
				const originalText = saveBtn.textContent;
				saveBtn.textContent = "Team Saved!";
				saveBtn.classList.add("btn-success");
				saveBtn.disabled = true;

				setTimeout(() => {
					saveBtn.textContent = "Update Team";
					saveBtn.classList.remove("btn-success");
					saveBtn.disabled = this.raceDeadlinePassed;
				}, 3000);
			}

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

			let errorMessage = "Failed to save team. Please try again.";
			if (error.message.includes("budget")) {
				errorMessage =
					"Budget validation failed. Please check your team value.";
			} else if (error.message.includes("driver")) {
				errorMessage =
					"Invalid driver selection. Please refresh and try again.";
			} else if (error.message.includes("race")) {
				errorMessage =
					"Race validation failed. Please refresh the page.";
			} else if (error.message.includes("deadline")) {
				errorMessage = "Submission deadline has passed.";
			}

			notificationModule.error(errorMessage);
			return false;
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

		let confirmMessage = `Are you sure you want to ${
			summary.isUpdate ? "update" : "save"
		} this team?`;

		if (summary.race) {
			confirmMessage += `\n\nRace: ${summary.race.name} (Round ${summary.race.round})`;
			if (summary.race.location) {
				confirmMessage += `\nLocation: ${summary.race.location}`;
			}
			confirmMessage += `\nDeadline: ${summary.race.deadline}`;
		}

		confirmMessage += `\n\nDrivers: ${summary.drivers
			.map((d) => d.name)
			.join(", ")}`;
		confirmMessage += `\nTotal Value: £${authModule.formatCurrency(
			summary.totalValue
		)}`;
		confirmMessage += `\nBudget Remaining: £${authModule.formatCurrency(
			summary.budgetRemaining
		)}`;
		confirmMessage += `\nCategories: ${summary.categories.join(", ")}`;

		const confirmed = confirm(confirmMessage.trim());
		if (!confirmed) {
			return;
		}

		await this.saveTeam();
	}

	updateTeamStats() {
		const teamValue = this.getTeamValue();
		const budgetRemaining = this.currentUser.budget - teamValue;
		const selectedCount = this.selectedDrivers.length;

		document.getElementById("selected-count").textContent = selectedCount;
		document.getElementById("budget-remaining").textContent =
			authModule.formatCurrency(budgetRemaining);
		document.getElementById("team-value").textContent =
			authModule.formatCurrency(teamValue);
		document.getElementById("budget-used").textContent =
			authModule.formatCurrency(teamValue);

		const saveBtn = document.getElementById("save-team-btn");
		if (saveBtn) {
			const validation = this.validateTeamComposition();
			const canSave =
				validation.valid &&
				this.currentRace &&
				!this.raceDeadlinePassed;

			saveBtn.disabled = !canSave;

			if (!this.currentRace) {
				saveBtn.textContent = "No Race Available";
			} else if (this.raceDeadlinePassed) {
				saveBtn.textContent = "Deadline Passed";
			} else if (selectedCount === 0) {
				saveBtn.textContent = "Select Drivers First";
			} else if (selectedCount < this.maxDrivers) {
				saveBtn.textContent = `Select ${
					this.maxDrivers - selectedCount
				} More Driver${
					this.maxDrivers - selectedCount !== 1 ? "s" : ""
				}`;
			} else if (!validation.valid) {
				saveBtn.textContent = "Fix Team Issues";
			} else {
				const isUpdate = this.existingRoster !== null;
				saveBtn.textContent = isUpdate ? "Update Team" : "Save Team";
			}
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
			console.log("Driver selection displayed");
		} catch (error) {
			console.error("Error showing driver selection:", error);
		}

		console.log("Driver selection displayed");
	}

	startDeadlineTimer() {
		this.deadlineTimer = setInterval(() => {
			if (this.currentRace) {
				this.checkRaceDeadline();
			}
		}, 60000);
	}

	stopDeadlineTimer() {
		if (this.deadlineTimer) {
			clearInterval(this.deadlineTimer);
			this.deadlineTimer = null;
		}
	}

	formatTimeRemaining(deadline) {
		const now = new Date();
		const timeRemaining = new Date(deadline) - now;

		if (timeRemaining <= 0) {
			return "Expired";
		}

		const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
		const hours = Math.floor(
			(timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
		);
		const minutes = Math.floor(
			(timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
		);

		if (days > 0) {
			return `${days}d ${hours}h`;
		} else if (hours > 0) {
			return `${hours}h ${minutes}m`;
		} else {
			return `${minutes}m`;
		}
	}

	canModifyRoster() {
		if (!this.currentRace) {
			return { canModify: false, reason: "No race available" };
		}

		if (this.currentRace.isLocked) {
			return {
				canModify: false,
				reason: "Race is locked by administrators",
			};
		}

		if (this.raceDeadlinePassed) {
			return {
				canModify: false,
				reason: "Submission deadline has passed",
			};
		}

		return { canModify: true, reason: null };
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

		authModule.updateBudgetDisplays(this.currentUser.budget);
		console.log(
			"User info updated for driver selection:",
			this.currentUser.username
		);
	}

	updateButtonStates() {
		const modifyCheck = this.canModifyRoster();
		const saveBtn = document.getElementById("save-team-btn");
		const clearBtn = document.getElementById("clear-team-btn");
		const autoFillBtn = document.getElementById("auto-fill-btn");

		if (clearBtn) clearBtn.disabled = !modifyCheck.canModify;
		if (autoFillBtn) autoFillBtn.disabled = !modifyCheck.canModify;

		if (saveBtn && !modifyCheck.canModify) {
			saveBtn.disabled = true;
		}

		const buttons = [saveBtn, clearBtn, autoFillBtn].filter(Boolean);
		buttons.forEach((btn) => {
			if (!modifyCheck.canModify) {
				btn.title = `Disabled: ${modifyCheck.reason}`;
				btn.classList.add("disabled-by-race");
			} else {
				btn.title = "";
				btn.classList.remove("disabled-by-race");
			}
		});
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

	hasRequiredCategories() {
		const required = ["M", "JS", "I"];
		const present = new Set();

		for (const driver of this.selectedDrivers) {
			for (const cat of driver.categories) {
				if (required.includes(cat)) {
					present.add(cat);
				}
			}
		}

		return required.every((cat) => present.has(cat));
	}

	getMissingCategories() {
		const required = new Set(["M", "JS", "I"]);
		const found = new Set();

		this.selectedDrivers.forEach((driver) => {
			driver.categories.forEach((cat) => {
				if (required.has(cat)) {
					found.add(cat);
				}
			});
		});

		return [...required].filter((cat) => !found.has(cat));
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	console.log("Driver selection DOM loaded");

	const driverSelection = new DriverSelection();
	await driverSelection.init();

	if (process.env.NODE_ENV === "development") {
		window.driverSelection = driverSelection;
	}
});

document.addEventListener("visibilitychange", () => {
	if (!document.hidden && window.driverSelection) {
		authModule.checkAuthentication().then((result) => {
			if (!result.success) {
				authModule.logout();
			}
		});
	}
});
