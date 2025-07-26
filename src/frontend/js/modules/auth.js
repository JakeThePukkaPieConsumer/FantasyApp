class AuthModule {
	constructor() {
		this.currentUser = null;
		this.token = null;
		this.currentYear = new Date().getFullYear().toString();
		this.userYear = null;
	}

	getToken() {
		if (!this.token) {
			this.token = localStorage.getItem("token");
		}
		return this.token;
	}

	setToken(token) {
		this.token = token;
		localStorage.setItem("token", token);
	}

	removeToken() {
		this.token = null;
		localStorage.removeItem("token");
	}

	getCurrentUser() {
		return this.currentUser;
	}

	setCurrentUser(user) {
		this.currentUser = user;
	}

	getCurrentYear() {
		return this.currentYear;
	}

	setCurrentYear(year) {
		this.currentYear = year;
	}

	getUserYear() {
		return this.userYear;
	}

	setUserYear(year) {
		this.userYear = year;
	}

	async checkAuthentication() {
		const token = this.getToken();

		if (!token) {
			console.log("No token found");
			return { success: false, error: "No token found" };
		}

		try {
			console.log("Verifying token...");
			const res = await fetch("/api/auth/verify", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				cache: "no-store",
			});

			console.log("Response status:", res.status);

			if (!res.ok) {
				console.log("Token verification failed, status:", res.status);
				this.removeToken();
				return { success: false, error: "Token verification failed" };
			}

			let data;
			try {
				data = await res.json();
				console.log("User data received:", data);
			} catch (e) {
				console.error("Failed to parse JSON response:", e);
				throw new Error("Invalid JSON from server");
			}

			if (data.success && data.user) {
				this.setCurrentUser(data.user);

				if (data.year) {
					this.setUserYear(data.year.toString());
				}
				return { success: true, user: data.user, year: data.year };
			} else {
				console.error("No user data in response");
				throw new Error("No user data received");
			}
		} catch (error) {
			console.error("Auth check failed:", error);
			this.removeToken();
			return { success: false, error: error.message };
		}
	}

	async login(username, pin, year = null) {
		try {
			const loginData = {
				username: username.trim(),
				pin,
			};

			if (year) {
				loginData.year = year;
			}

			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(loginData),
				cache: "no-store",
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.message || "Login failed");
			}

			this.setToken(data.token);
			this.setCurrentUser(data.user);

			if (data.year) {
				this.setUserYear(data.year.toString());
				this.setCurrentYear(data.year.toString());
			}

			return {
				success: true,
				user: data.user,
				year: data.year,
			};
		} catch (error) {
			console.error("Login error:", error);
			return { success: false, error: error.message };
		}
	}
	
	logout() {
		console.log("Logging out user");
		this.removeToken();
		this.setCurrentUser(null);
		this.setUserYear(null);

		// Use relative path to avoid protocol issues
		if (
			window.location.hostname === "localhost" ||
			window.location.hostname === "127.0.0.1"
		) {
			window.location.href = `${window.location.protocol}//${window.location.host}/login.html`;
		} else {
			window.location.href = "/login.html";
		}
	}

	async loadUsersForLogin(year = null) {
		try {
			const endpoint = year ? `/api/auth/${year}` : "/api/auth/";
			const res = await fetch(endpoint, {
				cache: "no-store",
			});

			if (!res.ok) {
				throw new Error("Failed to load users");
			}

			const data = await res.json();
			const users = data.users || [];

			users.sort((a, b) => a.username.localeCompare(b.username));

			return {
				success: true,
				users,
				year: data.year,
			};
		} catch (error) {
			console.error("Error loading users:", error);
			return { success: false, error: "Failed to load users" };
		}
	}

	async getAvailableYears() {
		try {
			const res = await fetch("/api/auth/years", {
				cache: "no-store",
			});

			if (!res.ok) {
				throw new Error("Failed to load available years");
			}

			const data = await res.json();

			return {
				success: true,
				years: data.historical || [],
				current: data.current,
			};
		} catch (error) {
			console.error("Error loading available years:", error);
			return { success: false, error: "Failed to load available years" };
		}
	}

	async searchUsers(query, year = null) {
		try {
			const token = this.getToken();
			if (!token) {
				throw new Error("Authentication required");
			}

			const params = new URLSearchParams();
			if (year) params.append("year", year);

			const queryString = params.toString();
			const endpoint = `/api/auth/search/${encodeURIComponent(query)}${
				queryString ? `?${queryString}` : ""
			}`;

			const res = await fetch(endpoint, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				cache: "no-store",
			});

			if (!res.ok) {
				throw new Error("Search failed");
			}

			const data = await res.json();

			return {
				success: true,
				results: data.results || [],
				query: data.query,
			};
		} catch (error) {
			console.error("Error searching users:", error);
			return { success: false, error: error.message };
		}
	}

	isAdmin() {
		return this.currentUser && this.currentUser.role === "admin";
	}

	validateLoginForm(username, pin) {
		if (!username || username.trim() === "") {
			return {
				valid: false,
				error: "Please select your name from the dropdown.",
			};
		}

		if (!pin || pin.trim() === "") {
			return { valid: false, error: "Please enter your PIN." };
		}

		if (pin.length !== 4) {
			return { valid: false, error: "PIN must be exactly 4 digits." };
		}

		if (!/^\d{4}$/.test(pin)) {
			return { valid: false, error: "PIN must contain only numbers." };
		}

		return { valid: true };
	}

	formatCurrency(amount) {
		return new Intl.NumberFormat("en-GB", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount || 0);
	}

	updateBudgetDisplays(budget) {
		const budgetElements = document.querySelectorAll(
			"#budget-display, #budget-stat"
		);
		budgetElements.forEach((element) => {
			if (element) {
				element.textContent = this.formatCurrency(budget);
			}
		});
	}

	updateYearDisplays(year) {
		const yearElements = document.querySelectorAll(".current-year-display");
		yearElements.forEach((element) => {
			if (element) {
				element.textContent = `${year} Season`;
			}
		});
	}

	getOperationalYear() {
		return (
			this.userYear ||
			this.currentYear ||
			new Date().getFullYear().toString()
		);
	}

	canAccessYear(year) {
		if (this.isAdmin()) {
			return true;
		}

		return year === this.userYear;
	}

	formatYearDisplay(year) {
		if (!year) return "Unknown";
		return `${year} Season`;
	}

	getYearOptions(availableYears = []) {
		const options = [];

		const currentCalendarYear = new Date().getFullYear().toString();
		if (
			!availableYears.some(
				(y) => y.year === parseInt(currentCalendarYear)
			)
		) {
			options.push({
				year: currentCalendarYear,
				display: this.formatYearDisplay(currentCalendarYear),
				isCurrent: true,
			});
		}

		availableYears.forEach((yearData) => {
			options.push({
				year: yearData.year.toString(),
				display: this.formatYearDisplay(yearData.year),
				userCount: yearData.userCount || 0,
				isCurrent: yearData.year.toString() === currentCalendarYear,
			});
		});

		options.sort((a, b) => parseInt(b.year) - parseInt(a.year));

		return options;
	}

	async initializeYearContext() {
		const authResult = await this.checkAuthentication();
		if (authResult.success && authResult.year) {
			this.setUserYear(authResult.year.toString());
			this.setCurrentYear(authResult.year.toString());
			return authResult.year.toString();
		}

		const currentYear = new Date().getFullYear().toString();
		this.setCurrentYear(currentYear);
		return currentYear;
	}
}

const authModule = new AuthModule();
export default authModule;
