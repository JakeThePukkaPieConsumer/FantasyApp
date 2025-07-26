class DriverUIManager {
	constructor(selectionManager, filterManager, notificationModule) {
		this.selectionManager = selectionManager;
		this.filterManager = filterManager;
		this.notificationModule = notificationModule;
		this.deadlineTimer = null;
	}

	init() {
		this.setupEventListeners();
		this.startDeadlineTimer();
	}

	setupEventListeners() {
		this.setupButton("logout-btn", () => {
			this.cleanup();
			this.selectionManager.authModule.logout();
		});

		this.setupButton("dashboard-btn", () => {
			window.location.href = "/dashboard.html";
		});

		this.setupButton("save-team-btn", async () => {
			await this.saveTeamWithConfirmation();
		});

		this.setupButton("clear-team-btn", () => {
			if (this.selectionManager.clearTeam()) {
				this.updateAll();
				this.notificationModule.info("Team selection cleared.");
			}
		});

		this.setupButton("refresh-race-btn", async () => {
			if (await this.selectionManager.refreshAllData()) {
				this.updateAll();
			}
		});

		// Filter buttons
		document.querySelectorAll(".filter-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				this.setActiveFilter(e.target);
				this.filterManager.filterByCategory(e.target.dataset.category);
				this.renderDrivers();
			});
		});

		// Search input
		const searchInput = document.getElementById("search-drivers");
		if (searchInput) {
			searchInput.addEventListener("input", (e) => {
				this.filterManager.searchDrivers(e.target.value);
				this.renderDrivers();
			});
		}

		// Sort button
		const sortBtn = document.getElementById("sort-by-value");
		if (sortBtn) {
			sortBtn.addEventListener("click", () => {
				const sortByValue = this.filterManager.toggleSort();
				sortBtn.textContent = sortByValue
					? "Sort by Name"
					: "Sort by Value";
				this.renderDrivers();
			});
		}

		// Keyboard shortcuts
		document.addEventListener("keydown", (e) => {
			this.handleKeyboardShortcuts(e);
		});

		// Visibility change
		document.addEventListener("visibilitychange", () => {
			this.handleVisibilityChange();
		});

		// Network status
		window.addEventListener("online", () => {
			this.notificationModule.info(
				"Connection restored. Refreshing data..."
			);
			this.selectionManager.refreshAllData().then(() => this.updateAll());
		});

		window.addEventListener("offline", () => {
			this.notificationModule.warning(
				"Connection lost. Some features may not work."
			);
		});

		console.log("Driver UI event listeners set up");
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
			if (this.selectionManager.canModifyRoster()) {
				this.saveTeamWithConfirmation();
			} else {
				this.notificationModule.warning(
					`Cannot save: ${this.selectionManager.getRosterModificationError()}`
				);
			}
		}

		if ((e.ctrlKey || e.metaKey) && e.key === "r") {
			e.preventDefault();
			if (this.selectionManager.clearTeam()) {
				this.updateAll();
				this.notificationModule.info("Team selection cleared.");
			}
		}

		if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key === "F5")) {
			e.preventDefault();
			this.selectionManager.refreshAllData().then(() => this.updateAll());
		}
	}

	handleVisibilityChange() {
		if (document.hidden) {
			this.stopDeadlineTimer();
		} else {
			this.selectionManager
				.loadRaceInformation()
				.then(() => {
					if (this.selectionManager.getCurrentRace()) {
						this.selectionManager.loadExistingRoster();
					}
					this.updateAll();
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

	setActiveFilter(activeBtn) {
		document.querySelectorAll(".filter-btn").forEach((btn) => {
			btn.classList.remove("active");
			btn.setAttribute("aria-pressed", "false");
		});
		activeBtn.classList.add("active");
		activeBtn.setAttribute("aria-pressed", "true");
	}

	renderDrivers() {
		const driversGrid = document.getElementById("drivers-grid");
		const noDriversMessage = document.getElementById("no-drivers");

		if (!driversGrid) return;

		const driversToRender = this.filterManager.getFilteredDrivers();
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
			value.textContent = `£${this.selectionManager.formatCurrency(
				driver.value || 0
			)}`;

		const selectedDrivers = this.selectionManager.getSelectedDrivers();
		const currentUser = this.selectionManager.getCurrentUser();

		const isSelected = selectedDrivers.some((d) => d._id === driver._id);
		const canAfford =
			currentUser &&
			currentUser.budget - this.selectionManager.getTeamValue() >=
				(driver.value || 0);
		const teamFull =
			selectedDrivers.length >= this.selectionManager.maxDrivers;

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
			selectBtn.addEventListener("click", () => {
				if (this.selectionManager.selectDriver(driver)) {
					this.updateAll();
					this.showSelectionFeedback();
				}
			});
		}

		if (removeBtn) {
			removeBtn.addEventListener("click", () => {
				if (this.selectionManager.removeDriver(driver._id)) {
					this.updateAll();
				}
			});
		}

		return card;
	}

	renderSelectedDrivers() {
		const selectedGrid = document.getElementById("selected-drivers-grid");
		const selectedSection = document.getElementById(
			"selected-drivers-section"
		);

		if (!selectedGrid || !selectedSection) return;

		const selectedDrivers = this.selectionManager.getSelectedDrivers();

		if (selectedDrivers.length === 0) {
			selectedSection.style.display = "none";
			return;
		}

		selectedSection.style.display = "block";
		selectedGrid.innerHTML = "";

		selectedDrivers.forEach((driver) => {
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
                <h4 class="driver-name">${this.escapeHTML(
					driver.name || "Unknown Driver"
				)}</h4>
                <p class="driver-value">£${this.selectionManager.formatCurrency(
					driver.value || 0
				)}</p>
            </div>
            <div class="driver-actions">
                <button class="btn btn-danger btn-sm remove-driver-btn">
                    Remove
                </button>
            </div>
        `;

		const removeBtn = card.querySelector(".remove-driver-btn");
		if (removeBtn) {
			removeBtn.addEventListener("click", () => {
				if (this.selectionManager.removeDriver(driver._id)) {
					this.updateAll();
				}
			});
		}

		return card;
	}

	updateRaceDisplay() {
		const currentRace = this.selectionManager.getCurrentRace();
		const raceStatus = this.selectionManager.getRaceStatus();

		const elements = {
			raceInfo: document.getElementById("current-race-info"),
			raceName: document.getElementById("current-race-name"),
			raceRound: document.getElementById("current-race-round"),
			raceLocation: document.getElementById("current-race-location"),
			raceDeadline: document.getElementById("race-deadline"),
		};

		if (!currentRace) {
			if (elements.raceInfo) elements.raceInfo.style.display = "none";
			return;
		}

		if (elements.raceInfo) elements.raceInfo.style.display = "block";
		if (elements.raceName)
			elements.raceName.textContent = currentRace.name || "Unknown Race";
		if (elements.raceRound)
			elements.raceRound.textContent = `Round ${
				currentRace.roundNumber || "TBA"
			}`;
		if (elements.raceLocation)
			elements.raceLocation.textContent = currentRace.location || "TBA";

		if (elements.raceDeadline && currentRace.submissionDeadline) {
			const deadline = new Date(currentRace.submissionDeadline);
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
		const raceStatus = this.selectionManager.getRaceStatus();
		const raceStatusEl = document.getElementById("race-status");
		const deadlineWarningEl = document.getElementById("deadline-warning");

		if (!raceStatus) return;

		if (raceStatusEl) {
			raceStatusEl.textContent = raceStatus.message;
			raceStatusEl.className = `race-status ${raceStatus.status}`;
		}

		if (deadlineWarningEl) {
			this.updateDeadlineWarning(deadlineWarningEl, raceStatus);
		}
	}

	updateDeadlineWarning(element, raceStatus) {
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

		const config = warningConfigs[raceStatus.status];

		if (config) {
			element.style.display = "block";
			element.className = config.className;
			element.innerHTML = config.html;
		} else {
			element.style.display = "none";
		}
	}

	updateTeamStats() {
		const selectedDrivers = this.selectionManager.getSelectedDrivers();
		const currentUser = this.selectionManager.getCurrentUser();
		const teamValue = this.selectionManager.getTeamValue();
		const budgetRemaining = currentUser
			? currentUser.budget - teamValue
			: 0;
		const selectedCount = selectedDrivers.length;

		this.updateElement("selected-count", selectedCount);
		this.updateElement(
			"budget-remaining",
			this.selectionManager.formatCurrency(budgetRemaining)
		);
		this.updateElement(
			"team-value",
			this.selectionManager.formatCurrency(teamValue)
		);
		this.updateElement(
			"budget-used",
			this.selectionManager.formatCurrency(teamValue)
		);

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

		const validation = this.selectionManager.validateTeamComposition();
		const canSave =
			validation.valid && this.selectionManager.canModifyRoster();
		const currentRace = this.selectionManager.getCurrentRace();
		const raceStatus = this.selectionManager.getRaceStatus();

		saveBtn.disabled = !canSave;

		if (!currentRace) {
			saveBtn.textContent = "No Race Available";
		} else if (!raceStatus?.canSubmit) {
			saveBtn.textContent = this.getRaceStatusButtonText(raceStatus);
		} else if (selectedCount === 0) {
			saveBtn.textContent = "Select Drivers First";
		} else if (selectedCount < this.selectionManager.maxDrivers) {
			const remaining = this.selectionManager.maxDrivers - selectedCount;
			saveBtn.textContent = `Select ${remaining} More Driver${
				remaining !== 1 ? "s" : ""
			}`;
		} else if (!validation.valid) {
			saveBtn.textContent = "Fix Team Issues";
		} else {
			const existingRoster = this.selectionManager.getExistingRoster();
			const isUpdate = existingRoster !== null;
			saveBtn.textContent = isUpdate ? "Update Team" : "Save Team";
		}
	}

	getRaceStatusButtonText(raceStatus) {
		switch (raceStatus?.status) {
			case "expired":
				return "Deadline Passed";
			case "locked":
				return "Race Locked";
			default:
				return "Cannot Submit";
		}
	}

	showSelectionFeedback() {
		const validation = this.selectionManager.validateTeamComposition();
		const selectedDrivers = this.selectionManager.getSelectedDrivers();

		if (selectedDrivers.length > 0) {
			if (validation.valid) {
				if (
					selectedDrivers.length === this.selectionManager.maxDrivers
				) {
					this.notificationModule.success(
						"Team is complete and ready to submit!"
					);
				} else {
					this.notificationModule.info(
						`Team valid but incomplete. Add ${
							this.selectionManager.maxDrivers -
							selectedDrivers.length
						} more driver(s) for a full team.`
					);
				}
			} else {
				const filteredErrors = validation.errors.filter(
					(error) => !error.includes("Must have exactly")
				);
				if (filteredErrors.length > 0) {
					this.notificationModule.warning(filteredErrors[0]);
				}
			}
		}
	}

	async saveTeamWithConfirmation() {
		if (!this.selectionManager.canModifyRoster()) {
			this.notificationModule.error(
				this.selectionManager.getRosterModificationError()
			);
			return;
		}

		const validation = this.selectionManager.validateTeamComposition();
		if (!validation.valid) {
			this.notificationModule.error("Team validation failed:");
			validation.errors.forEach((error) => {
				this.notificationModule.error(error, { duration: 7000 });
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

	async saveTeam() {
		const currentRace = this.selectionManager.getCurrentRace();
		const currentUser = this.selectionManager.getCurrentUser();
		const raceStatus = this.selectionManager.getRaceStatus();
		const selectedDrivers = this.selectionManager.getSelectedDrivers();
		const existingRoster = this.selectionManager.getExistingRoster();

		if (!currentRace) {
			this.notificationModule.error("No race available for submissions");
			return false;
		}

		if (!currentUser?.id) {
			this.notificationModule.error("User information not available");
			return false;
		}

		if (!raceStatus?.canSubmit) {
			this.notificationModule.error(
				raceStatus?.message || "Cannot submit for this race"
			);
			return false;
		}

		if (selectedDrivers.length === 0) {
			this.notificationModule.warning(
				"Please select at least one driver before saving."
			);
			return false;
		}

		const teamValue = this.selectionManager.getTeamValue();
		if (currentUser && teamValue > currentUser.budget) {
			this.notificationModule.error("Team value exceeds your budget.");
			return false;
		}

		if (!this.selectionManager.hasRequiredCategories()) {
			const missing = this.selectionManager.getMissingCategories();
			this.notificationModule.error(
				`Your team is missing drivers from required categories: ${missing.join(
					", "
				)}`
			);
			return false;
		}

		try {
			const loadingNotification = this.notificationModule.showLoading(
				"Saving your team..."
			);

			const rosterData = {
				user: currentUser.id,
				drivers: selectedDrivers.map((driver) => driver._id),
				budgetUsed: teamValue,
				pointsEarned: 0,
				race: currentRace._id,
			};

			let result;
			if (existingRoster) {
				result =
					await this.selectionManager.apiModules.rosters.updateRoster(
						this.selectionManager.currentYear,
						existingRoster._id,
						rosterData
					);
			} else {
				result =
					await this.selectionManager.apiModules.rosters.createRoster(
						this.selectionManager.currentYear,
						rosterData
					);
			}

			this.notificationModule.remove(loadingNotification);

			if (!result.success) {
				throw new Error(result.error || "Failed to save roster");
			}

			const actionText = existingRoster ? "updated" : "saved";
			this.notificationModule.success(
				`Team ${actionText} successfully for ${currentRace.name}!`,
				{ duration: 3000 }
			);

			this.selectionManager.existingRoster = result.data.roster;
			this.updateSaveButtonSuccess(actionText);

			setTimeout(() => {
				const shouldRedirect = confirm(
					`Team ${actionText} successfully for ${currentRace.name}! Would you like to go to the dashboard?`
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
				const raceStatus = this.selectionManager.getRaceStatus();
				saveBtn.disabled = !raceStatus?.canSubmit;
			}, 3000);
		}
	}

	getTeamSummary() {
		const currentRace = this.selectionManager.getCurrentRace();
		const selectedDrivers = this.selectionManager.getSelectedDrivers();
		const currentUser = this.selectionManager.getCurrentUser();
		const teamValue = this.selectionManager.getTeamValue();
		const budgetRemaining = currentUser
			? currentUser.budget - teamValue
			: 0;
		const existingRoster = this.selectionManager.getExistingRoster();

		return {
			race: currentRace
				? {
						name: currentRace.name,
						round: currentRace.roundNumber,
						location: currentRace.location,
						deadline: new Date(
							currentRace.submissionDeadline
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
			drivers: selectedDrivers.map((driver) => ({
				name: driver.name,
				value: driver.value,
				categories: Array.isArray(driver.categories)
					? driver.categories.join(", ")
					: "",
			})),
			totalDrivers: selectedDrivers.length,
			totalValue: teamValue,
			budgetUsed: teamValue,
			budgetRemaining: budgetRemaining,
			categories: this.getSelectedCategories(),
			isUpdate: existingRoster !== null,
		};
	}

	getSelectedCategories() {
		const categories = new Set();
		const selectedDrivers = this.selectionManager.getSelectedDrivers();

		selectedDrivers.forEach((driver) => {
			if (Array.isArray(driver.categories)) {
				driver.categories.forEach((cat) => categories.add(cat));
			}
		});
		return Array.from(categories).sort();
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
		message += `\nTotal Value: £${this.selectionManager.formatCurrency(
			summary.totalValue
		)}`;
		message += `\nBudget Remaining: £${this.selectionManager.formatCurrency(
			summary.budgetRemaining
		)}`;
		message += `\nCategories: ${summary.categories.join(", ")}`;

		return message;
	}

	handleRosterError(error) {
		const errorMessage = error.message.toLowerCase();

		if (errorMessage.includes("deadline")) {
			this.notificationModule.error(
				"Submission deadline has passed for this race."
			);
			this.selectionManager.loadRaceInformation();
		} else if (errorMessage.includes("locked")) {
			this.notificationModule.error(
				"This race has been locked by administrators."
			);
			this.selectionManager.loadRaceInformation();
		} else if (errorMessage.includes("budget")) {
			this.notificationModule.error(
				"Team value exceeds your available budget."
			);
		} else if (errorMessage.includes("driver")) {
			this.notificationModule.error(
				"One or more selected drivers are invalid. Please refresh and try again."
			);
		} else if (errorMessage.includes("race")) {
			this.notificationModule.error(
				"Race information is invalid. Please refresh the page."
			);
			this.selectionManager.loadRaceInformation();
		} else {
			this.notificationModule.error(
				"An unexpected error occurred. Please try again."
			);
		}
	}

	startDeadlineTimer() {
		this.stopDeadlineTimer();
		this.deadlineTimer = setInterval(() => {
			const currentRace = this.selectionManager.getCurrentRace();
			const raceStatus = this.selectionManager.getRaceStatus();
			if (currentRace && raceStatus) {
				this.selectionManager.checkRaceEligibility().then(() => {
					this.updateDeadlineStatus();
				});
			}
		}, 60000);
	}

	stopDeadlineTimer() {
		if (this.deadlineTimer) {
			clearInterval(this.deadlineTimer);
			this.deadlineTimer = null;
		}
	}

	updateAll() {
		this.filterManager.setDrivers(this.selectionManager.getDrivers());
		this.updateTeamStats();
		this.renderDrivers();
		this.renderSelectedDrivers();
		this.updateRaceDisplay();
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
			this.updateAll();
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
		const currentUser = this.selectionManager.getCurrentUser();
		if (!currentUser) return;

		this.selectionManager.authModule.updateBudgetDisplays(
			currentUser.budget
		);
		console.log(
			"User info updated for driver selection:",
			currentUser.username
		);
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

	cleanup() {
		this.stopDeadlineTimer();
		this.selectionManager.cleanup();
	}
}

export default DriverUIManager;
