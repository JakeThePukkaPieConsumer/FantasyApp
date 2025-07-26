class DriverManager {
	constructor(
		apiModule,
		modalModule,
		notificationModule,
		elevationModule,
		authModule
	) {
		this.apiModule = apiModule;
		this.modalModule = modalModule;
		this.authModule = authModule;
		this.currentYear = this.authModule.getCurrentYear();
		this.notificationModule = notificationModule;
		this.elevationModule = elevationModule;
		this.drivers = [];
	}

	init() {
		this.setupEventListeners();
		this.loadDrivers();
	}

	setupEventListeners() {
		const createDriverBtn = document.getElementById("create-driver-btn");
		if (createDriverBtn) {
			createDriverBtn.addEventListener("click", () => {
				this.modalModule.showCreateDriver();
			});
		}

		const driverForm = document.getElementById("driver-form");
		if (driverForm) {
			driverForm.addEventListener("submit", (e) =>
				this.handleDriverFormSubmit(e)
			);
		}

		const driverValueInput = document.getElementById("driver-value");
		if (driverValueInput) {
			driverValueInput.addEventListener("input", (e) => {
				if (parseFloat(e.target.value) < 0) {
					e.target.value = 0 * 0.1;
				}
			});
		}

		document
			.querySelectorAll('input[name="categories"]')
			.forEach((checkbox) => {
				checkbox.addEventListener("change", () => {
					const checked = [
						...document.querySelectorAll(
							'input[name="categories"]:checked'
						),
					];
					if (checked.length > 2) {
						checkbox.checked = false;
						this.notificationModule.warning(
							"You can only select up to 2 categories."
						);
					}
				});
			});
	}

	async loadDrivers() {
		try {
			const result = await this.apiModule.drivers.getDrivers(
				this.currentYear
			);

			if (!result.success) {
				throw new Error(result.error);
			}

			this.drivers = result.data.drivers || [];
			this.renderDriversTable();
		} catch (error) {
			console.error("Error loading drivers:", error);
			this.notificationModule.error("Failed to load drivers");
		}
	}

	renderDriversTable() {
		const tbody = document.getElementById("drivers-table-body");
		if (!tbody) return;

		tbody.innerHTML = "";

		if (this.drivers.length === 0) {
			const row = document.createElement("tr");
			row.innerHTML = `
                <td colspan="5" class="text-center text-tertiary">
                    <div class="flex items-center justify-center gap-2 py-8">
                        <span>No drivers found</span>
                    </div>
                </td>
            `;
			tbody.appendChild(row);
			return;
		}

		this.drivers.forEach((driver) => {
			const row = this.createDriverRow(driver);
			tbody.appendChild(row);
		});
	}

	createDriverRow(driver) {
		const row = document.createElement("tr");

		const nameTd = document.createElement("td");
		nameTd.textContent = driver.name;
		row.appendChild(nameTd);

		const valueTd = document.createElement("td");
		valueTd.textContent = `£${driver.value}`;
		row.appendChild(valueTd);

		const pointsTd = document.createElement("td");
		pointsTd.textContent = driver.points;
		row.appendChild(pointsTd);

		const catTd = document.createElement("td");
		catTd.textContent = driver.categories.join(", ");
		row.appendChild(catTd);

		const actionsTd = document.createElement("td");

		const editBtn = document.createElement("button");
		editBtn.className = "btn btn-edit btn-sm";
		editBtn.textContent = "Edit";
		editBtn.addEventListener("click", () => this.editDriver(driver._id));

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "btn btn-delete btn-sm";
		deleteBtn.textContent = "Delete";
		deleteBtn.addEventListener("click", () =>
			this.deleteDriver(driver._id, driver.name)
		);

		actionsTd.appendChild(editBtn);
		actionsTd.appendChild(deleteBtn);
		row.appendChild(actionsTd);

		return row;
	}

	async handleDriverFormSubmit(e) {
		e.preventDefault();

		const formData = new FormData(e.target);

		const categories = [];
		document
			.querySelectorAll('input[name="categories"]:checked')
			.forEach((checkbox) => {
				categories.push(checkbox.value);
			});

		const driverData = {
			name: formData.get("name"),
			value: parseFloat(formData.get("value")) || 0,
			points: parseFloat(formData.get("points")) || 0,
			categories: categories,
		};

		const imageURL = formData.get("imageURL");
		const description = formData.get("description");

		if (imageURL) driverData.imageURL = imageURL;
		if (description) driverData.description = description;

		const validation = this.validateDriverForm(driverData);
		if (!validation.valid) {
			this.notificationModule.error(validation.error);
			return;
		}

		const mode = e.target.dataset.mode;
		const driverId = e.target.dataset.driverId;

		let success = false;
		if (mode === "edit" && driverId) {
			success = await this.updateDriver(driverId, driverData);
		} else {
			success = await this.createDriver(driverData);
		}

		if (success) {
			this.modalModule.close("driver-modal");
		}
	}

	validateDriverForm(driverData) {
		if (!driverData.name || driverData.name.trim() === "") {
			return { valid: false, error: "Driver name is required" };
		}

		if (driverData.value < 0) {
			return { valid: false, error: "Driver value cannot be negative" };
		}

		if (driverData.categories.length === 0) {
			return { valid: false, error: "Please select at least 1 category" };
		}

		if (driverData.categories.length > 2) {
			return {
				valid: false,
				error: "Please select maximum 2 categories",
			};
		}

		if (driverData.imageURL) {
			try {
				new URL(driverData.imageURL);
			} catch {
				return {
					valid: false,
					error: "Please enter a valid image URL",
				};
			}
		}

		return { valid: true };
	}

	async createDriver(driverData) {
		if (!this.elevationModule.requireElevation()) {
			return false;
		}

		try {
			const result = await this.apiModule.drivers.createDriver(
				this.currentYear,
				driverData,
				this.elevationModule.getElevatedToken()
			);

			if (!result.success) {
				throw new Error(result.error);
			}

			this.notificationModule.success("Driver created successfully");
			await this.loadDrivers();
			return true;
		} catch (error) {
			console.error("Error creating driver:", error);
			this.notificationModule.error(error.message);
			return false;
		}
	}

	async updateDriver(driverId, driverData) {
		if (!this.elevationModule.requireElevation()) {
			return false;
		}

		try {
			const result = await this.apiModule.drivers.updateDriver(
				this.currentYear,
				driverId,
				driverData,
				this.elevationModule.getElevatedToken()
			);

			if (!result.success) {
				throw new Error(result.error);
			}

			this.notificationModule.success("Driver updated successfully");
			await this.loadDrivers();
			return true;
		} catch (error) {
			console.error("Error updating driver:", error);
			this.notificationModule.error(error.message);
			return false;
		}
	}

	async deleteDriverById(driverId) {
		if (!this.elevationModule.requireElevation()) {
			return false;
		}

		try {
			const result = await this.apiModule.drivers.deleteDriver(
				this.currentYear, 
				driverId,
				this.elevationModule.getElevatedToken()
			);

			if (!result.success) {
				throw new Error(result.error);
			}

			this.notificationModule.success("Driver deleted successfully");
			await this.loadDrivers();
			return true;
		} catch (error) {
			console.error("Error deleting driver:", error);
			this.notificationModule.error(error.message);
			return false;
		}
	}

	editDriver(driverId) {
		const driver = this.drivers.find((d) => d._id === driverId);
		if (!driver) {
			this.notificationModule.error("Driver not found");
			return;
		}

		this.modalModule.showEditDriver(driver);
	}

	deleteDriver(driverId, driverName) {
		this.modalModule.showConfirmation(
			`Are you sure you want to delete driver "${driverName}"?`,
			() => this.deleteDriverById(driverId)
		);
	}

	getDriverById(driverId) {
		return this.drivers.find((d) => d._id === driverId);
	}

	getDrivers() {
		return [...this.drivers];
	}

	getDriversByCategory(category) {
		return this.drivers.filter((d) => d.categories.includes(category));
	}

	getDriversByValueRange(min, max) {
		return this.drivers.filter((d) => d.value >= min && d.value <= max);
	}

	searchDrivers(query) {
		const lowerQuery = query.toLowerCase();
		return this.drivers.filter((d) =>
			d.name.toLowerCase().includes(lowerQuery)
		);
	}

	getDriverCount() {
		return this.drivers.length;
	}

	getTotalValue() {
		return this.drivers.reduce((total, driver) => total + driver.value, 0);
	}

	getDriverCategories() {
		const categories = new Set();
		this.drivers.forEach((driver) => {
			driver.categories.forEach((category) => {
				categories.add(category);
			});
		});
		return Array.from(categories);
	}

	async refresh() {
		await this.loadDrivers();
	}
}

export default DriverManager;
