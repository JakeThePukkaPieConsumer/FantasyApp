class ModalModule {
	constructor() {
		this.activeModal = null;
		this.confirmCallback = null;
		this.init();
	}

	init() {
		document.addEventListener("click", (e) => {
			if (
				e.target.classList.contains("close") ||
				e.target.hasAttribute("data-modal")
			) {
				const modalId =
					e.target.getAttribute("data-modal") ||
					e.target.closest(".modal").id;
				if (modalId) {
					this.close(modalId);
				}
			}

			if (e.target.classList.contains("modal")) {
				this.close(e.target.id);
			}
		});

		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.activeModal) {
				this.close(this.activeModal);
			}
		});
	}

	open(modalId, options = {}) {
		const modal = document.getElementById(modalId);
		if (!modal) {
			console.error(`Modal with ID "${modalId}" not found`);
			return;
		}

		modal.style.display = "block";
		this.activeModal = modalId;

		if (options.focusFirst !== false) {
			const firstInput = modal.querySelector("input, select, textarea");
			if (firstInput) {
				setTimeout(() => firstInput.focus(), 100);
			}
		}

		if (options.onOpen) {
			options.onOpen(modal);
		}
	}

	close(modalId, options = {}) {
		const modal = document.getElementById(modalId);
		if (!modal) {
			console.error(`Modal with ID "${modalId}" not found`);
			return;
		}

		modal.style.display = "none";
		this.activeModal = null;

		if (options.resetForm !== false) {
			this.resetModalForm(modalId);
		}

		if (options.onClose) {
			options.onClose(modal);
		}
	}

	resetModalForm(modalId) {
		const modal = document.getElementById(modalId);
		const form = modal?.querySelector("form");

		if (form) {
			form.reset();
			delete form.dataset.userId;
			delete form.dataset.driverId;
			delete form.dataset.mode;
		}

		if (modalId === "user-modal") {
			this.resetUserModal();
		} else if (modalId === "driver-modal") {
			this.resetDriverModal();
		}
	}

	resetUserModal() {
		const titleEl = document.getElementById("user-modal-title");
		const submitBtn = document.getElementById("user-submit-btn");

		if (titleEl) titleEl.textContent = "Create User";
		if (submitBtn) submitBtn.textContent = "Create User";
	}

	resetDriverModal() {
		const titleEl = document.getElementById("driver-modal-title");
		const submitBtn = document.getElementById("driver-submit-btn");

		if (titleEl) titleEl.textContent = "Create Driver";
		if (submitBtn) submitBtn.textContent = "Create Driver";

		const checkboxes = document.querySelectorAll(
			'input[name="categories"]'
		);
		checkboxes.forEach((cb) => (cb.checked = false));
	}

	showConfirmation(message, onConfirm, options = {}) {
		const messageEl = document.getElementById("confirm-message");
		const confirmBtn = document.getElementById("confirm-yes");

		if (messageEl) {
			messageEl.textContent = message;
		}

		if (confirmBtn) {
			const newConfirmBtn = confirmBtn.cloneNode(true);
			confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

			newConfirmBtn.addEventListener("click", () => {
				if (onConfirm) onConfirm();
				this.close("confirm-modal");
			});
		}

		this.open("confirm-modal", options);
	}

	showCreateUser() {
		this.resetUserModal();
		this.open("user-modal");
	}

	showEditUser(user) {
		if (!user) {
			console.error("User data required for edit modal");
			return;
		}

		const form = document.getElementById("user-form");
		const titleEl = document.getElementById("user-modal-title");
		const submitBtn = document.getElementById("user-submit-btn");

		if (titleEl) titleEl.textContent = "Edit User";
		if (submitBtn) submitBtn.textContent = "Update User";

		const usernameEl = document.getElementById("user-username");
		const pinEl = document.getElementById("user-pin");
		const pointsEl = document.getElementById("user-points");
		const roleEl = document.getElementById("user-role");
		const budgetEl = document.getElementById("user-budget");

		if (usernameEl) usernameEl.value = user.username;
		if (pinEl) pinEl.value = "";
		if (pointsEl) pointsEl.value = user.points;
		if (roleEl) roleEl.value = user.role;
		if (budgetEl) budgetEl.value = user.budget;

		if (form) {
			form.dataset.userId = user._id;
			form.dataset.mode = "edit";
		}

		this.open("user-modal");
	}

	showCreateDriver() {
		this.resetDriverModal();
		this.open("driver-modal");
	}

	showEditDriver(driver) {
		if (!driver) {
			console.error("Driver data required for edit modal");
			return;
		}

		const form = document.getElementById("driver-form");
		const titleEl = document.getElementById("driver-modal-title");
		const submitBtn = document.getElementById("driver-submit-btn");

		if (titleEl) titleEl.textContent = "Edit Driver";
		if (submitBtn) submitBtn.textContent = "Update Driver";

		const nameEl = document.getElementById("driver-name");
		const valueEl = document.getElementById("driver-value");
		const pointsEl = document.getElementById("driver-points");
		const imageEl = document.getElementById("driver-image");
		const descEl = document.getElementById("driver-description");

		if (nameEl) nameEl.value = driver.name;
		if (valueEl) valueEl.value = driver.value;
		if (pointsEl) pointsEl.value = driver.points;
		if (imageEl) imageEl.value = driver.imageURL || "";
		if (descEl) descEl.value = driver.description || "";

		const categoryCheckboxes = document.querySelectorAll(
			'input[name="categories"]'
		);
		categoryCheckboxes.forEach((checkbox) => {
			checkbox.checked = driver.categories.includes(checkbox.value);
		});

		if (form) {
			form.dataset.driverId = driver._id;
			form.dataset.mode = "edit";
		}

		this.open("driver-modal");
	}

	getActiveModal() {
		return this.activeModal;
	}

	isModalOpen() {
		return this.activeModal !== null;
	}
}

const modalModule = new ModalModule();
export default modalModule;
