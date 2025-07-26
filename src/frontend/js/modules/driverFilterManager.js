class DriverFilterManager {
	constructor() {
		this.filteredDrivers = [];
		this.allDrivers = [];
		this.currentFilter = "all";
		this.sortByValue = false;
		this.searchQuery = "";
	}

	setDrivers(drivers) {
		this.allDrivers = [...drivers];
		this.applyFilters();
	}

	filterByCategory(category) {
		this.currentFilter = category;
		this.applyFilters();
	}

	searchDrivers(query) {
		this.searchQuery = query.toLowerCase().trim();
		this.applyFilters();
	}

	toggleSort() {
		this.sortByValue = !this.sortByValue;
		this.applyFilters();
		return this.sortByValue;
	}

	applyFilters() {
		let filtered = [...this.allDrivers];

		if (this.currentFilter !== "all") {
			filtered = filtered.filter(
				(driver) =>
					Array.isArray(driver.categories) &&
					driver.categories.includes(this.currentFilter)
			);
		}

		if (this.searchQuery) {
			filtered = filtered.filter((driver) =>
				driver.name.toLowerCase().includes(this.searchQuery)
			);
		}

		if (this.sortByValue) {
			filtered.sort((a, b) => (b.value || 0) - (a.value || 0));
		} else {
			filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
		}

		this.filteredDrivers = filtered;
	}

	getFilteredDrivers() {
		return [...this.filteredDrivers];
	}

	getCurrentFilter() {
		return this.currentFilter;
	}

	getCurrentSort() {
		return this.sortByValue;
	}

	getSearchQuery() {
		return this.searchQuery;
	}

	reset() {
		this.currentFilter = "all";
		this.sortByValue = false;
		this.searchQuery = "";
		this.applyFilters();
	}
}

export default DriverFilterManager;
