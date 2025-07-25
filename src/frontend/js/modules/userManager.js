class UserManager {
    constructor(apiModule, modalModule, notificationModule, elevationModule, authModule) {
        this.apiModule = apiModule;
        this.modalModule = modalModule;
        this.notificationModule = notificationModule;
        this.elevationModule = elevationModule;
        this.authModule = authModule;
        this.users = [];
        this.currentYear = this.authModule.getCurrentYear();
        this.availableYears = [];
    }

    init() {
        this.setupEventListeners();
        this.initializeYearSelector();
        this.loadUsers();
    }

    setupEventListeners() {
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', () => {
                this.modalModule.showCreateUser();
            });
        }

        const userForm = document.getElementById('user-form');
        if (userForm) {
            userForm.addEventListener('submit', (e) => this.handleUserFormSubmit(e));
        }

        const userPinInput = document.getElementById('user-pin');
        if (userPinInput) {
            userPinInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            });
        }

        const userBudgetInput = document.getElementById('user-budget');
        if (userBudgetInput) {
            userBudgetInput.addEventListener('input', (e) => {
                if (parseFloat(e.target.value) < 0) {
                    e.target.value = 0;
                }
            });
        }

        // Year selector
        const yearSelector = document.getElementById('user-year-selector');
        if (yearSelector) {
            yearSelector.addEventListener('change', (e) => {
                this.switchYear(e.target.value);
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-users-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }
    }

    async initializeYearSelector() {
        try {
            // Load available years
            const yearsResult = await this.apiModule.auth.getAvailableYears();
            if (yearsResult.success) {
                this.availableYears = yearsResult.data.historical || [];
                this.renderYearSelector();
            }
        } catch (error) {
            console.error('Error loading available years:', error);
        }
    }

    renderYearSelector() {
        const yearSelector = document.getElementById('user-year-selector');
        if (!yearSelector) return;

        yearSelector.innerHTML = '';

        // Get year options from auth module
        const yearOptions = this.authModule.getYearOptions(this.availableYears);

        yearOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.year;
            optionElement.textContent = option.display;
            if (option.userCount) {
                optionElement.textContent += ` (${option.userCount} users)`;
            }
            if (option.year === this.currentYear) {
                optionElement.selected = true;
            }
            yearSelector.appendChild(optionElement);
        });
    }

    async switchYear(year) {
        if (year === this.currentYear) return;

        // Check if user can access this year
        if (!this.authModule.canAccessYear(year)) {
            this.notificationModule.error('You do not have access to this year');
            return;
        }

        this.currentYear = year;
        this.authModule.setCurrentYear(year);
        
        // Update year displays
        this.authModule.updateYearDisplays(year);
        
        // Reload users for new year
        await this.loadUsers();
        
        this.notificationModule.info(`Switched to ${this.authModule.formatYearDisplay(year)}`);
    }

    async withElevation(callback) {
        if (!this.elevationModule.requireElevation()) return false;
        try {
            const token = this.elevationModule.getElevatedToken();
            return await callback(token);
        } catch (error) {
            console.error(error);
            this.notificationModule.error(error.message);
            return false;
        }
    }

    async loadUsers() {
        try {
            // Show loading indicator
            const loadingNotification = this.notificationModule.showLoading('Loading users...');

            const result = await this.apiModule.users.getUsers(this.currentYear);

            // Hide loading indicator
            this.notificationModule.remove(loadingNotification);

            if (!result.success) {
                throw new Error(result.error);
            }

            this.users = result.data.users || [];
            this.renderUsersTable();
            this.updateUserStats();

        } catch (error) {
            console.error('Error loading users:', error);
            this.notificationModule.error(`Failed to load users for ${this.authModule.formatYearDisplay(this.currentYear)}`);
        }
    }

    renderUsersTable() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.users.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="text-center text-tertiary">
                    <div class="flex items-center justify-center gap-2 py-8">
                        <span>No users found for ${this.authModule.formatYearDisplay(this.currentYear)}</span>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
            return;
        }

        this.users.forEach(user => {
            const row = this.createUserRow(user);
            tbody.appendChild(row);
        });
    }

    createUserRow(user) {
        const row = document.createElement('tr');

        const usernameTd = document.createElement('td');
        usernameTd.textContent = user.username;
        row.appendChild(usernameTd);

        const roleTd = document.createElement('td');
        roleTd.innerHTML = `<span class="badge badge-${user.role === 'admin' ? 'primary' : 'secondary'}">${user.role}</span>`;
        row.appendChild(roleTd);

        const budgetTd = document.createElement('td');
        budgetTd.textContent = `£${this.authModule.formatCurrency(user.budget)}`;
        row.appendChild(budgetTd);
        
        const pointsTd = document.createElement('td');
        pointsTd.textContent = user.points ?? '0';
        row.appendChild(pointsTd);

        const actionsTd = document.createElement('td');
        const btnGroup = document.createElement('div');
        btnGroup.className = 'btn-group';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-edit btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => this.editUser(user._id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-delete btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => this.deleteUser(user._id, user.username));

        const resetPinBtn = document.createElement('button');
        resetPinBtn.className = 'btn btn-warning btn-sm';
        resetPinBtn.textContent = 'Reset PIN';
        resetPinBtn.addEventListener('click', () => this.showResetPinModal(user._id, user.username));

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(deleteBtn);
        btnGroup.appendChild(resetPinBtn);
        actionsTd.appendChild(btnGroup);
        row.appendChild(actionsTd);

        return row;
    }

    updateUserStats() {
        const totalUsersEl = document.getElementById('total-users-stat');
        const totalBudgetEl = document.getElementById('total-budget-stat');
        const avgBudgetEl = document.getElementById('avg-budget-stat');

        if (totalUsersEl) {
            totalUsersEl.textContent = this.users.length;
        }

        if (totalBudgetEl || avgBudgetEl) {
            const totalBudget = this.users.reduce((sum, user) => sum + (user.budget || 0), 0);
            const avgBudget = this.users.length > 0 ? totalBudget / this.users.length : 0;

            if (totalBudgetEl) {
                totalBudgetEl.textContent = `£${this.authModule.formatCurrency(totalBudget)}`;
            }
            if (avgBudgetEl) {
                avgBudgetEl.textContent = `£${this.authModule.formatCurrency(avgBudget)}`;
            }
        }

        // Update year display
        const yearDisplayEl = document.getElementById('current-year-display');
        if (yearDisplayEl) {
            yearDisplayEl.textContent = this.authModule.formatYearDisplay(this.currentYear);
        }
    }

    async handleUserFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const rawPoints = formData.get('points');
        const userData = {
            username: formData.get('username'),
            role: formData.get('role'),
            budget: parseFloat(formData.get('budget')) || 0,
            points: rawPoints ? parseFloat(rawPoints) : 0
        };

        const pin = formData.get('pin');
        if (pin) {
            userData.pin = pin;
        }

        const mode = e.target.dataset.mode;
        const userId = e.target.dataset.userId;

        const validation = this.validateUserForm(userData, mode, pin);
        if (!validation.valid) {
            this.notificationModule.error(validation.error);
            return;
        }

        let success = false;
        if (mode === 'edit' && userId) {
            success = await this.updateUser(userId, userData);
        } else {
            success = await this.createUser(userData);
        }

        if (success) {
            this.modalModule.close('user-modal');
        }
    }

    validateUserForm(userData, mode, pin) {
        if (!userData.username || userData.username.trim() === '') {
            return { valid: false, error: 'Username is required' };
        }

        if (mode !== 'edit' && !pin) {
            return { valid: false, error: 'PIN is required for new users' };
        }

        if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
            return { valid: false, error: 'PIN must be exactly 4 digits' };
        }

        if (!userData.role) {
            return { valid: false, error: 'Role is required' };
        }

        if (userData.budget < 0) {
            return { valid: false, error: 'Budget cannot be negative' };
        }

        if (userData.points !== undefined && userData.points < 0) {
            return { valid: false, error: 'Points cannot be negative' };
        }

        return { valid: true };
    }

    async createUser(userData) {
        return await this.withElevation(async (token) => {
            const result = await this.apiModule.users.createUser(userData, token, this.currentYear);
            if (!result.success) throw new Error(result.error);
            
            this.notificationModule.success(`User created successfully in ${this.authModule.formatYearDisplay(this.currentYear)}`);
            await this.loadUsers();
            return true;
        });
    }

    async updateUser(userId, userData) {
        return await this.withElevation(async (token) => {
            const result = await this.apiModule.users.updateUser(
                userId,
                userData,
                token,
                this.currentYear
            );

            if (!result.success) throw new Error(result.error);

            this.notificationModule.success(`User updated successfully in ${this.authModule.formatYearDisplay(this.currentYear)}`);
            await this.loadUsers();
            return true;
        });
    }

    async deleteUserById(userId) {
        return await this.withElevation(async (token) => {
            const result = await this.apiModule.users.deleteUser(userId, token, this.currentYear);

            if (!result.success) throw new Error(result.error);

            this.notificationModule.success(`User deleted successfully from ${this.authModule.formatYearDisplay(this.currentYear)}`);
            await this.loadUsers();
            return true;
        });
    }

    async resetUserPin(userId, newPin) {
        return await this.withElevation(async (token) => {
            const result = await this.apiModule.users.resetUserPin(userId, newPin, token, this.currentYear);

            if (!result.success) throw new Error(result.error);

            this.notificationModule.success('PIN reset successfully');
            return true;
        });
    }

    showResetPinModal(userId, username) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'reset-pin-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Reset PIN for ${username}</h3>
                    <span class="close" data-modal="reset-pin-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="reset-pin-form">
                        <div class="form-group">
                            <label for="new-pin">New PIN (4 digits):</label>
                            <input type="text" id="new-pin" name="newPin" maxlength="4" pattern="[0-9]{4}" required>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" data-modal="reset-pin-modal">Cancel</button>
                            <button type="submit" class="btn btn-primary">Reset PIN</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const form = modal.querySelector('#reset-pin-form');
        const pinInput = modal.querySelector('#new-pin');

        // PIN input validation
        pinInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPin = pinInput.value;

            if (newPin.length !== 4) {
                this.notificationModule.error('PIN must be exactly 4 digits');
                return;
            }

            const success = await this.resetUserPin(userId, newPin);
            if (success) {
                document.body.removeChild(modal);
            }
        });

        this.modalModule.open('reset-pin-modal');
    }

    editUser(userId) {
        const user = this.users.find(u => u._id === userId);
        if (!user) {
            this.notificationModule.error('User not found');
            return;
        }

        this.modalModule.showEditUser(user);
    }

    deleteUser(userId, username) {
        this.modalModule.showConfirmation(
            `Are you sure you want to delete user "${username}" from ${this.authModule.formatYearDisplay(this.currentYear)}?`,
            () => this.deleteUserById(userId)
        );
    }

    async searchUsers(query) {
        try {
            const result = await this.authModule.searchUsers(query, this.currentYear);
            if (result.success) {
                return result.results;
            }
            throw new Error(result.error);
        } catch (error) {
            console.error('Error searching users:', error);
            this.notificationModule.error('Search failed');
            return [];
        }
    }

    getUserById(userId) {
        return this.users.find(u => u._id === userId);
    }

    getUsers() {
        return [...this.users];
    }

    getUsersByRole(role) {
        return this.users.filter(u => u.role === role);
    }

    getUserCount() {
        return this.users.length;
    }

    getTotalBudget() {
        return this.users.reduce((total, user) => total + (user.budget || 0), 0);
    }

    getAverageBudget() {
        return this.users.length > 0 ? this.getTotalBudget() / this.users.length : 0;
    }

    getCurrentYear() {
        return this.currentYear;
    }

    async refresh() {
        await this.loadUsers();
        await this.initializeYearSelector();
        this.notificationModule.info('Users refreshed');
    }

    exportUsers() {
        if (this.users.length === 0) {
            this.notificationModule.warning('No users to export');
            return;
        }

        const csvData = this.convertUsersToCSV();
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `users_${this.currentYear}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(url);
        this.notificationModule.success('Users exported successfully');
    }

    convertUsersToCSV() {
        const headers = ['Username', 'Role', 'Budget', 'Points'];
        const rows = this.users.map(user => [
            user.username,
            user.role,
            user.budget || 0,
            user.points || 0
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }
}

export default UserManager;