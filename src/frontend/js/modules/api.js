class ApiModule {
	constructor(authModule) {
		this.authModule = authModule;

		// More robust localhost detection
		if (
			window.location.hostname === "localhost" ||
			window.location.hostname === "127.0.0.1" ||
			window.location.hostname === "0.0.0.0"
		) {
			// Force HTTP for localhost development
			this.baseURL = `http://${window.location.host}`;
		} else if (window.location.protocol === "https:") {
			this.baseURL = window.location.origin;
		} else {
			this.baseURL = `${window.location.protocol}//${window.location.host}`;
		}

		this.currentYear = new Date().getFullYear().toString();
		console.log("API Base URL set to:", this.baseURL); // Debug log
	}

	setCurrentYear(year) {
		this.currentYear = year;
	}

	getCurrentYear() {
		return this.currentYear;
	}

	getHeaders(includeAuth = true, customHeaders = {}) {
		const headers = {
			"Content-Type": "application/json",
			...customHeaders,
		};

		if (includeAuth) {
			const token = this.authModule.getToken();
			if (token) {
				headers["Authorization"] = `Bearer ${token}`;
			}
		}

		return headers;
	}

	async request(endpoint, options = {}) {
		const {
			method = "GET",
			data,
			headers = {},
			includeAuth = true,
			cache = "no-store",
			timeout = 30000,
		} = options;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const requestOptions = {
			method,
			headers: this.getHeaders(includeAuth, headers),
			cache,
			signal: controller.signal,
		};

		if (
			data &&
			(method === "POST" || method === "PUT" || method === "PATCH")
		) {
			requestOptions.body = JSON.stringify(data);
		}

		try {
			const response = await fetch(
				`${this.baseURL}${endpoint}`,
				requestOptions
			);
			clearTimeout(timeoutId);

			const contentType = response.headers.get("content-type");
			let responseData;

			if (contentType && contentType.includes("application/json")) {
				responseData = await response.json();
			} else {
				responseData = await response.text();
			}

			if (!response.ok) {
				const errorMessage =
					responseData?.message ||
					responseData?.error ||
					responseData ||
					`HTTP ${response.status}: ${response.statusText}`;

				const error = new Error(errorMessage);
				error.status = response.status;
				error.response = responseData;
				throw error;
			}

			return {
				success: true,
				data: responseData,
				status: response.status,
			};
		} catch (error) {
			clearTimeout(timeoutId);

			if (error.name === "AbortError") {
				console.error(`API request timeout: ${method} ${endpoint}`);
				return {
					success: false,
					error: "Request timeout",
					status: 408,
				};
			}

			console.error(`API request failed: ${method} ${endpoint}`, error);
			return {
				success: false,
				error: error.message,
				status: error.status || 0,
				response: error.response,
			};
		}
	}

	async get(endpoint, options = {}) {
		return this.request(endpoint, { ...options, method: "GET" });
	}

	async post(endpoint, data, options = {}) {
		return this.request(endpoint, { ...options, method: "POST", data });
	}

	async put(endpoint, data, options = {}) {
		return this.request(endpoint, { ...options, method: "PUT", data });
	}

	async delete(endpoint, options = {}) {
		return this.request(endpoint, { ...options, method: "DELETE" });
	}

	async patch(endpoint, data, options = {}) {
		return this.request(endpoint, { ...options, method: "PATCH", data });
	}
}

/**
 * Authentication API
 */
class AuthApi extends ApiModule {
	constructor(authModule) {
		super(authModule);
	}

	async login(username, pin, year = null) {
		const loginData = { username, pin };
		if (year) {
			loginData.year = year;
		}
		return this.post("/api/auth/login", loginData, { includeAuth: false });
	}

	async verify() {
		return this.get("/api/auth/verify");
	}

	async getCurrentUsers() {
		return this.get("/api/auth/");
	}

	async getUsersByYear(year, options = {}) {
		const { role, sort = "username", order = "asc" } = options;
		const params = new URLSearchParams();
		if (role) params.append("role", role);
		if (sort) params.append("sort", sort);
		if (order) params.append("order", order);

		const queryString = params.toString();
		const endpoint = `/api/auth/${year}${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}

	async getAvailableYears() {
		return this.get("/api/auth/years");
	}

	async getUserStats(year) {
		return this.get(`/api/auth/${year}/stats`);
	}

	async getUserById(year, userId) {
		return this.get(`/api/auth/${year}/${userId}`);
	}

	async searchUsers(query, year = null) {
		const params = new URLSearchParams();
		if (year) params.append("year", year);

		const queryString = params.toString();
		const endpoint = `/api/auth/search/${encodeURIComponent(query)}${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}
}

/**
 * User management API
 */
class UserApi extends ApiModule {
	constructor(authModule, elevationModule) {
		super(authModule);
		this.elevationModule = elevationModule;
	}

	async getUsers(year = null, options = {}) {
		const { role, sort = "username", order = "asc" } = options;
		const params = new URLSearchParams();
		if (year) params.append("year", year);
		if (role) params.append("role", role);
		if (sort) params.append("sort", sort);
		if (order) params.append("order", order);

		const queryString = params.toString();
		const endpoint = `/api/users${queryString ? `?${queryString}` : ""}`;
		return this.get(endpoint);
	}

	async getUserById(userId, year = null) {
		const params = new URLSearchParams();
		if (year) params.append("year", year);

		const queryString = params.toString();
		const endpoint = `/api/admin/users/${userId}${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}

	async createUser(userData, elevatedToken, year = null) {
		const data = { ...userData };
		if (year) {
			data.year = year;
		}

		return this.post("/api/users", data, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async updateUser(userId, userData, elevatedToken, year = null) {
		const data = { ...userData };
		if (year) {
			data.year = year;
		}

		return this.put(`/api/users/${userId}`, data, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async deleteUser(userId, elevatedToken, year = null) {
		const params = new URLSearchParams();
		if (year) params.append("year", year);

		const queryString = params.toString();
		const endpoint = `/api/users/${userId}${
			queryString ? `?${queryString}` : ""
		}`;

		return this.delete(endpoint, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async resetUserPin(userId, newPin, elevatedToken, year = null) {
		const data = { newPin };
		if (year) {
			data.year = year;
		}

		return this.post(`/api/users/${userId}/reset-pin`, data, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async getUserStats(year = null) {
		const params = new URLSearchParams();
		if (year) params.append("year", year);

		const queryString = params.toString();
		const endpoint = `/api/users/stats${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}

	async requestElevation(elevationKey) {
		return this.post("/api/users/elevate", { elevationKey });
	}
}

/**
 * Driver management API
 */
class DriverApi extends ApiModule {
	constructor(authModule, elevationModule) {
		super(authModule);
		this.elevationModule = elevationModule;
	}

	async getAvailableYears() {
		return this.get("/api/drivers/");
	}

	async getDrivers(year, options = {}) {
		const { category, sort = "name", order = "asc" } = options;
		const params = new URLSearchParams();
		if (category) params.append("category", category);
		if (sort) params.append("sort", sort);
		if (order) params.append("order", order);

		const queryString = params.toString();
		const endpoint = `/api/drivers/${year}${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}

	async getDriverById(year, driverId) {
		return this.get(`/api/driver/${year}/${driverId}`);
	}

	async createDriver(year, driverData, elevatedToken) {
		return this.post(`/api/drivers/${year}`, driverData, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async updateDriver(year, driverId, driverData, elevatedToken) {
		return this.put(`/api/drivers/${year}/${driverId}`, driverData, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async deleteDriver(year, driverId, elevatedToken) {
		return this.delete(`/api/drivers/${year}/${driverId}`, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async getDriverStats(year) {
		return this.get(`/api/drivers/${year}/stats`);
	}
}

/**
 * Roster management API - Fixed version
 */
class RosterApi extends ApiModule {
	constructor(authModule) {
		super(authModule);
	}

	async getRosters(year, options = {}) {
		const { user, race, sort = "createdAt", order = "desc" } = options;
		const params = new URLSearchParams();
		if (user) params.append("user", user);
		if (race) params.append("race", race);
		if (sort) params.append("sort", sort);
		if (order) params.append("order", order);

		const queryString = params.toString();
		const endpoint = `/api/roster/${year}${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}

	async validateRoster(year, rosterData) {
		return this.post(`/api/roster/${year}/validate`, rosterData);
	}

	async getRosterById(year, rosterId) {
		return this.get(`/api/roster/${year}/${rosterId}`);
	}

	async createRoster(year, rosterData) {
		// Ensure user ID is properly formatted
		const formattedData = {
			...rosterData,
			user: rosterData.user || rosterData.userId, // Handle both formats
		};

		// Remove userId if it exists to avoid confusion
		delete formattedData.userId;

		return this.post(`/api/roster/${year}`, formattedData);
	}

	async updateRoster(year, rosterId, rosterData) {
		// Fixed: Remove userId parameter that was causing the undefined issue
		// The route only needs year and rosterId
		const formattedData = {
			...rosterData,
			user: rosterData.user || rosterData.userId, // Handle both formats
		};

		// Remove userId if it exists
		delete formattedData.userId;

		return this.put(`/api/roster/${year}/${rosterId}`, formattedData);
	}

	async deleteRoster(year, rosterId) {
		return this.delete(`/api/roster/${year}/${rosterId}`);
	}

	async getRosterStats(year) {
		return this.get(`/api/roster/${year}/stats`);
	}

	async getUserRosters(year, userId) {
		return this.get(`/api/roster/${year}/user/${userId}`);
	}
}

/**
 * Race management API
 */
class RaceApi extends ApiModule {
	constructor(authModule, elevationModule) {
		super(authModule);
		this.elevationModule = elevationModule;
	}

	async getAvailableYears() {
		return this.get("/api/races/");
	}

	async getRaces(year, options = {}) {
		const { status, sort = "roundNumber", order = "asc" } = options;
		const params = new URLSearchParams();

		if (status) params.append("status", status);
		if (sort) params.append("sort", sort);
		if (order) params.append("order", order);

		const queryString = params.toString();
		const endpoint = `/api/races/${year}${
			queryString ? `?${queryString}` : ""
		}`;
		return this.get(endpoint);
	}

	async getRaceById(year, raceId) {
		return this.get(`/api/races/${year}/${raceId}`);
	}

	async getCurrentRace(year) {
		const result = await this.getRaces(year, {
			sort: "submissionDeadline",
			order: "asc",
		});

		if (!result.success) return result;

		const now = new Date();
		const currentRace = result.data.races?.find((race) => {
			if (!race.events || race.events.length === 0) return false;

			const submissionDeadline = new Date(race.submissionDeadline);
			const raceEnd = new Date(
				Math.max(...race.events.map((e) => new Date(e.endtime)))
			);

			return (
				(now <= submissionDeadline && !race.isLocked) ||
				(now >= submissionDeadline && now <= raceEnd)
			);
		});

		return {
			...result,
			data: {
				...result.data,
				races: currentRace ? [currentRace] : [],
				current: currentRace || null,
			},
		};
	}

	async getNextSubmissionRace(year) {
		const result = await this.getSubmissionAvailableRaces(year);

		if (!result.success) return result;

		const nextRace = result.data.races?.[0] || null;

		return {
			...result,
			data: {
				...result.data,
				races: nextRace ? [nextRace] : [],
				next: nextRace,
			},
		};
	}

	async getSubmissionAvailableRaces(year) {
		const result = await this.getRaces(year, {
			sort: "submissionDeadline",
			order: "asc",
		});

		if (!result.success) return result;

		const now = new Date();
		const availableRaces =
			result.data.races?.filter((race) => {
				if (race.isLocked) return false;
				const submissionDeadline = new Date(race.submissionDeadline);
				return now <= submissionDeadline;
			}) || [];

		return {
			...result,
			data: {
				...result.data,
				races: availableRaces,
				count: availableRaces.length,
			},
		};
	}

	async checkSubmissionEligibility(year, raceId) {
		const result = await this.getRaceById(year, raceId);

		if (!result.success) return result;

		const race = result.data.race;
		const now = new Date();
		const submissionDeadline = new Date(race.submissionDeadline);

		const eligible = !race.isLocked && now <= submissionDeadline;
		const timeRemaining =
			submissionDeadline > now ? submissionDeadline - now : 0;

		return {
			...result,
			data: {
				race,
				eligible,
				locked: race.isLocked,
				deadlinePassed: now > submissionDeadline,
				timeRemaining,
				hoursRemaining: Math.floor(timeRemaining / (1000 * 60 * 60)),
				deadlineSoon:
					timeRemaining > 0 && timeRemaining < 24 * 60 * 60 * 1000,
			},
		};
	}

	async updateRace(year, raceId, raceData, elevatedToken) {
		return this.put(`/api/race/${year}/${raceId}`, raceData, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async toggleRaceLock(year, raceId, isLocked, elevatedToken) {
		return this.put(
			`/api/races/${year}/${raceId}/lock`,
			{ isLocked },
			{
				includeAuth: false,
				headers: { Authorization: `Bearer ${elevatedToken}` },
			}
		);
	}
}

/**
 * Year management API
 */
class YearApi extends ApiModule {
	constructor(authModule, elevationModule) {
		super(authModule);
		this.elevationModule = elevationModule;
	}

	async getAvailableYears() {
		return this.get("/api/years/");
	}

	async getAllYearStats() {
		return this.get("/api/years/stats");
	}

	async getYearStats(year) {
		return this.get(`/api/years/${year}/stats`);
	}

	async initializeYear(year, elevatedToken) {
		return this.post(
			`/api/years/${year}/initialize`,
			{},
			{
				includeAuth: false,
				headers: { Authorization: `Bearer ${elevatedToken}` },
			}
		);
	}

	async copyYearData(sourceYear, targetYear, collections, elevatedToken) {
		const data = { sourceYear, targetYear, collections };
		return this.post("/api/year/copy", data, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
		});
	}

	async compareYears(year1, year2) {
		return this.get(`/api/years/${year1}/compare/${year2}`);
	}

	async deleteYear(year, elevatedToken) {
		const data = { confirmDelete: "DELETE_ALL_DATA" };
		return this.delete(`/api/years/${year}`, {
			includeAuth: false,
			headers: { Authorization: `Bearer ${elevatedToken}` },
			data,
		});
	}
}

/**
 * Year manager utility
 */
class YearManager {
	constructor(apiModules) {
		this.api = apiModules;
		this.currentYear = new Date().getFullYear().toString();
		this.availableYears = [];
	}

	async initialize() {
		await this.loadAvailableYears();
		return this;
	}

	async loadAvailableYears() {
		try {
			const result = await this.api.years.getAvailableYears();
			if (result.success) {
				this.availableYears = result.data.years || [];
			}
		} catch (error) {
			console.error("Failed to load available years:", error);
		}
	}

	getCurrentYear() {
		return this.currentYear;
	}

	setCurrentYear(year) {
		this.currentYear = year;
		Object.values(this.api).forEach((apiModule) => {
			if (apiModule.setCurrentYear) {
				apiModule.setCurrentYear(year);
			}
		});
	}

	getAvailableYears() {
		return [...this.availableYears];
	}

	isValidYear(year) {
		return (
			/^\d{4}$/.test(year) &&
			parseInt(year) >= 2020 &&
			parseInt(year) <= 2030
		);
	}

	async switchToYear(year) {
		if (!this.isValidYear(year)) {
			throw new Error("Invalid year format");
		}

		this.setCurrentYear(year);
		return year;
	}

	formatYearForDisplay(year) {
		return `${year} Season`;
	}

	getYearsList() {
		return this.availableYears.map((yearData) => ({
			year: yearData.year,
			display: this.formatYearForDisplay(yearData.year),
			hasData: yearData.driverCount > 0 || yearData.userCount > 0,
		}));
	}
}

/**
 * Factory function to create all API modules
 */
function createApiModules(authModule, elevationModule) {
	return {
		auth: new AuthApi(authModule),
		users: new UserApi(authModule, elevationModule),
		drivers: new DriverApi(authModule, elevationModule),
		rosters: new RosterApi(authModule),
		races: new RaceApi(authModule, elevationModule),
		years: new YearApi(authModule, elevationModule),
	};
}

export {
	ApiModule,
	AuthApi,
	UserApi,
	DriverApi,
	RosterApi,
	RaceApi,
	YearApi,
	YearManager,
	createApiModules,
};
