import authModule from "./modules/auth.js";
import notificationModule from "./modules/notification.js";

class LoginPage {
	constructor() {
		this.isLoading = false;
		this.users = [];
	}

	async init() {
		console.log("Initializing login page...");

		const authResult = await authModule.checkAuthentication();
		if (authResult.success) {
			console.log("User already authenticated, redirecting...");
			this.redirectToDashboard();
			return;
		}

		await this.loadUsers();
		this.setupEventListeners();

		console.log("Login page initialized");
	}

	async loadUsers() {
		try {
			const result = await authModule.loadUsersForLogin();
			console.log(result);

			if (result.success) {
				this.users = result.users;
				this.populateUserDropdown();
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error("Error loading users:", error);
			this.showError("Failed to load users. Please refresh the page.");
		}
	}

	populateUserDropdown() {
		const usernameSelect = document.getElementById("username");
		if (!usernameSelect) return;

		usernameSelect.innerHTML =
			'<option value="" disabled selected>Select your name...</option>';

		this.users.forEach((user) => {
			const option = document.createElement("option");
			option.value = user.username;
			option.textContent = user.username;
			usernameSelect.appendChild(option);
		});

		console.log(`Loaded ${this.users.length} users into dropdown`);
	}

	setupEventListeners() {
		const loginForm = document.getElementById("login-form");
		if (loginForm) {
			loginForm.addEventListener("submit", (e) => this.handleLogin(e));
		}

		const pinInput = document.getElementById("pin");
		if (pinInput) {
			pinInput.addEventListener("input", (e) => {
				e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
			});

			pinInput.addEventListener("keydown", (e) => {
				const allowedKeys = ["Backspace", "Tab", "Escape", "Enter", "Delete"];

				const ctrlAllowedKeys = ["a", "c", "v", "x"];

				if (
					allowedKeys.includes(e.key) ||
					(e.ctrlKey && ctrlAllowedKeys.includes(e.key.toLowerCase()))
				) {
					return;
				}

				const isNumberKey =
					(e.key >= "0" && e.key <= "9") ||
					(e.code.startsWith("Numpad") && e.key >= "0" && e.key <= "9");

				if (e.shiftKey || !isNumberKey) {
					e.preventDefault();
				}
			});

		}
		const usernameSelect = document.getElementById("username");
		if (usernameSelect) {
			usernameSelect.addEventListener("change", () => {
				this.hideError();
				const pinInput = document.getElementById("pin");
				if (pinInput) {
					setTimeout(() => pinInput.focus(), 100);
				}
			});
		}

		console.log("Login event listeners set up");
	}

	async handleLogin(e) {
		e.preventDefault();

		if (this.isLoading) return;

		const formData = new FormData(e.target);
		const username = formData.get("username");
		const pin = formData.get("pin");

		const validation = authModule.validateLoginForm(username, pin);
		if (!validation.valid) {
			this.showError(validation.error);
			return;
		}

		this.setLoadingState(true);
		this.hideError();

		try {
			const loginResult = await authModule.login(username, pin);

			if (loginResult.success) {
				console.log("Login successful for user:", username);
				notificationModule.success(
					`Welcome back, ${loginResult.user.username}!`
				);

				setTimeout(() => {
					this.redirectToDashboard();
				}, 1000);
			} else {
				throw new Error(loginResult.error);
			}
		} catch (error) {
			console.error("Login error:", error);
			this.showError(error.message || "Login failed. Please try again.");
		} finally {
			this.setLoadingState(false);
		}
	}

	setLoadingState(loading) {
		this.isLoading = loading;

		const loginBtn = document.getElementById("login-btn");
		const loginText = document.getElementById("login-text");
		const loginSpinner = document.getElementById("login-spinner");
		const form = document.getElementById("login-form");

		if (loginBtn) {
			loginBtn.disabled = loading;
		}

		if (loginText) {
			loginText.style.display = loading ? "none" : "inline";
		}

		if (loginSpinner) {
			loginSpinner.style.display = loading ? "inline-block" : "none";
		}

		if (form) {
			const inputs = form.querySelectorAll("input, select, button");
			inputs.forEach((input) => {
				input.disabled = loading;
			});
		}
	}

	showError(message) {
		const errorElement = document.getElementById("error-message");
		if (errorElement) {
			errorElement.textContent = message;
			errorElement.style.display = "block";
		}
	}

	hideError() {
		const errorElement = document.getElementById("error-message");
		if (errorElement) {
			errorElement.style.display = "none";
		}
	}

	redirectToDashboard() {
		const redirectUrl =
			sessionStorage.getItem("loginRedirect") || "/dashboard.html";
		sessionStorage.removeItem("loginRedirect");

		window.location.href = redirectUrl;
	}

	async refreshUsers() {
		await this.loadUsers();
	}

	getUsers() {
		return [...this.users];
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	console.log("Login page DOM loaded");

	const loginPage = new LoginPage();
	await loginPage.init();

	window.loginPage = loginPage;
});

window.addEventListener("pageshow", (event) => {
	if (event.persisted && window.loginPage) {
		authModule.checkAuthentication().then((result) => {
			if (result.success) {
				window.loginPage.redirectToDashboard();
			}
		});
	}
});

window.addEventListener("beforeunload", () => {
	if (window.loginPage) {
		window.loginPage.setLoadingState(false);
	}
});
