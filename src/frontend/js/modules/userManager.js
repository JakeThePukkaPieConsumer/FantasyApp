class UserManager {
    constructor(apiModule, modalModule, notificationModule, elevationModule) {
        this.apiModule = apiModule;
        this.modalModule = modalModule;
        this.notificationModule = notificationModule;
        this.elevationModule = elevationModule;
        this.users = [];
    }

    init() {
        this.setupEventListeners();
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
    }

    async loadUsers() {
        try {
            const result = await this.apiModule.users.getUsers();

            if (!result.success) {
                throw new Error(result.error);
            }

            this.users = result.data || [];
            this.renderUsersTable();
        } catch (error) {
            console.error('Error loading users:', error);
            this.notificationModule.error('Failed to load users');
        }
    }

    renderUsersTable() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.users.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="4" class="text-center text-tertiary">
                    <div class="flex items-center justify-center gap-2 py-8">
                        <span>No users found</span>
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
        roleTd.textContent = user.role;
        row.appendChild(roleTd);

        const budgetTd = document.createElement('td');
        budgetTd.textContent = `£${user.budget}`;
        row.appendChild(budgetTd);

        const actionsTd = document.createElement('td');
        const btnGroup = document.createElement('div');

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-edit btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => this.editUser(user._id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-delete btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => this.deleteUser(user._id, user.username));

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(deleteBtn);
        actionsTd.appendChild(btnGroup);
        row.appendChild(actionsTd);

        return row;
    }

    async handleUserFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const userData = {
            username: formData.get('username'),
            role: formData.get('role'),
            budget: parseFloat(formData.get('budget')) || 0
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

        return { valid: true };
    }

    async createUser(userData) {
        if (!this.elevationModule.requireElevation()) {
            return false;
        }

        try {
            const result = await this.apiModule.users.createUser(
                userData, 
                this.elevationModule.getElevatedToken()
            );

            if (!result.success) {
                throw new Error(result.error);
            }

            this.notificationModule.success('User created successfully');
            await this.loadUsers();
            return true;
        } catch (error) {
            console.error('Error creating user:', error);
            this.notificationModule.error(error.message);
            return false;
        }
    }

    async updateUser(userId, userData) {
        if (!this.elevationModule.requireElevation()) {
            return false;
        }

        try {
            const result = await this.apiModule.users.updateUser(
                userId, 
                userData, 
                this.elevationModule.getElevatedToken()
            );

            if (!result.success) {
                throw new Error(result.error);
            }

            this.notificationModule.success('User updated successfully');
            await this.loadUsers();
            return true;
        } catch (error) {
            console.error('Error updating user:', error);
            this.notificationModule.error(error.message);
            return false;
        }
    }

    async deleteUserById(userId) {
        if (!this.elevationModule.requireElevation()) {
            return false;
        }

        try {
            const result = await this.apiModule.users.deleteUser(
                userId, 
                this.elevationModule.getElevatedToken()
            );

            if (!result.success) {
                throw new Error(result.error);
            }

            this.notificationModule.success('User deleted successfully');
            await this.loadUsers();
            return true;
        } catch (error) {
            console.error('Error deleting user:', error);
            this.notificationModule.error(error.message);
            return false;
        }
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
            `Are you sure you want to delete user "${username}"?`,
            () => this.deleteUserById(userId)
        );
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

    searchUsers(query) {
        const lowerQuery = query.toLowerCase();
        return this.users.filter(u => 
            u.username.toLowerCase().includes(lowerQuery)
        );
    }

    getUserCount() {
        return this.users.length;
    }

    async refresh() {
        await this.loadUsers();
    }
}

export default UserManager;