// Global state
let currentUser = null;
let isElevated = false;
let elevatedToken = null;
let users = [];
let drivers = [];

async function checkAuthentication() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.log('No token found');
        showUnauthorized();
        return;
    }

    try {
        console.log('Verifying token...');
        const res = await fetch('/api/auth/user/verify', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store'
        });

        console.log('Response status:', res.status);

        if (!res.ok) {
            console.log('Token verification failed, status:', res.status);
            localStorage.removeItem('token');
            showUnauthorized();
            return;
        }

        let data;
        try {
            data = await res.json();
            console.log('User data received:', data);
        } catch (e) {
            console.error('Failed to parse JSON response:', e);
            throw new Error('Invalid JSON from server');
        }

        if (data.user && data.user.role === 'admin') {
            currentUser = data.user;
            displayAdminPanel();
        } else {
            console.log('User is not admin, role:', data.user?.role);
            showUnauthorized();
        }

    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('token');
        showUnauthorized();
    }
}

function displayAdminPanel() {
    console.log('Displaying admin panel for:', currentUser);
    
    // Update budget display
    const budgetElement = document.getElementById('budget-display');
    if (budgetElement) {
        budgetElement.textContent = currentUser.budget || '0';
    }

    // Show admin panel
    hideLoading();
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('unauthorized').style.display = 'none';

    // Load initial data
    loadUsers();
    loadDrivers();
}

function showUnauthorized() {
    console.log('Showing unauthorized message');
    hideLoading();
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('unauthorized').style.display = 'block';
}

function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

function logout() {
    console.log('Logging out user');
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// Elevation system
function restoreElevation() {
    const savedToken = sessionStorage.getItem('elevatedToken');
    if (savedToken) {
        elevatedToken = savedToken;
        isElevated = true;
        updateElevationStatus();
        showElevatedActions();
        startElevationTimeout();
    }
}

let elevationTimeoutId;

function startElevationTimeout() {
    if (elevationTimeoutId) clearTimeout(elevationTimeoutId);

    elevationTimeoutId = setTimeout(() => {
        isElevated = false;
        elevatedToken = null;
        sessionStorage.removeItem('elevatedToken');
        updateElevationStatus();
        hideElevatedActions();
        showInfo('Elevation expired. Please request elevation again if needed.');
    }, 15 * 60 * 1000); // 15 minutes
}

async function requestElevation(elevationKey) {
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch('/api/admin/users/elevate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ elevationKey })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Elevation failed');
        }

        elevatedToken = data.token;
        isElevated = true;

        // Persist elevated token in sessionStorage
        sessionStorage.setItem('elevatedToken', elevatedToken);

        updateElevationStatus();
        showElevatedActions();
        closeModal('elevation-modal');
        showSuccess('Elevation granted successfully');

        startElevationTimeout();

        return true;
    } catch (error) {
        console.error('Elevation failed:', error);
        showError(error.message);
        return false;
    }
}

function updateElevationStatus() {
    const statusElement = document.getElementById('elevation-status');
    const elevateBtn = document.getElementById('elevate-btn');
    
    if (isElevated) {
        statusElement.textContent = 'Elevated';
        statusElement.classList.add('elevated');
        elevateBtn.style.display = 'none';
    } else {
        statusElement.textContent = 'Not Elevated';
        statusElement.classList.remove('elevated');
        elevateBtn.style.display = 'inline-block';
    }
}

function showElevatedActions() {
    document.getElementById('elevated-actions').style.display = 'block';
}

function hideElevatedActions() {
    document.getElementById('elevated-actions').style.display = 'none';
}

// User management
async function loadUsers() {
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch('/api/auth/user/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            throw new Error('Failed to load users');
        }

        users = await res.json();
        renderUsersTable();
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users');
    }
}

// Render the users on the table
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');

        // Create cells
        const usernameTd = document.createElement('td');
        usernameTd.textContent = user.username;

        const roleTd = document.createElement('td');
        roleTd.textContent = user.role;

        const budgetTd = document.createElement('td');
        budgetTd.textContent = `£${user.budget}`;

        // Actions cell
        const actionsTd = document.createElement('td');

        const btnGroup = document.createElement('div');

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-edit btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => editUser(user._id));

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-delete btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteUser(user._id, user.username));

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(deleteBtn);

        actionsTd.appendChild(btnGroup);

        row.appendChild(usernameTd);
        row.appendChild(roleTd);
        row.appendChild(budgetTd);
        row.appendChild(actionsTd);

        tbody.appendChild(row);
    });
}

async function createUser(userData) {
    if (!isElevated) {
        showError('Elevation required to create users');
        return false;
    }

    try {
        const res = await fetch('/api/admin/users/users', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${elevatedToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to create user');
        }

        showSuccess('User created successfully');
        loadUsers();
        return true;
    } catch (error) {
        console.error('Error creating user:', error);
        showError(error.message);
        return false;
    }
}

async function updateUser(userId, userData) {
    if (!isElevated) {
        showError('Elevation required to update users');
        return false;
    }

    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${elevatedToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to update user');
        }

        showSuccess('User updated successfully');
        loadUsers();
        return true;
    } catch (error) {
        console.error('Error updating user:', error);
        showError(error.message);
        return false;
    }
}

async function deleteUserById(userId) {
    if (!isElevated) {
        showError('Elevation required to delete users');
        return false;
    }

    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${elevatedToken}`
            }
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to delete user');
        }

        showSuccess('User deleted successfully');
        loadUsers();
        return true;
    } catch (error) {
        console.error('Error deleting user:', error);
        showError(error.message);
        return false;
    }
}

function editUser(userId) {
    const user = users.find(u => u._id === userId);
    if (!user) {
        showError('User not found');
        return;
    }

    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-pin').value = '';
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-budget').value = user.budget;
    document.getElementById('user-submit-btn').textContent = 'Update User';

    const form = document.getElementById('user-form');
    form.dataset.userId = userId;
    form.dataset.mode = 'edit';

    openModal('user-modal');
}

function deleteUser(userId, username) {
    showConfirmation(`Are you sure you want to delete user "${username}"?`, () => {
        deleteUserById(userId);
    });
}

async function loadDrivers() {
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch('/api/drivers/drivers', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            throw new Error('Failed to load drivers');
        }

        const data = await res.json();
        drivers = data.drivers || [];
        renderDriversTable();
    } catch (error) {
        console.error('Error loading drivers:', error);
        showError('Failed to load drivers');
    }
}

function renderDriversTable() {
    const tbody = document.getElementById('drivers-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    drivers.forEach(driver => {
        const row = document.createElement('tr');

        // Name
        const nameTd = document.createElement('td');
        nameTd.textContent = driver.name;
        row.appendChild(nameTd);

        // Value
        const valueTd = document.createElement('td');
        valueTd.textContent = `£${driver.value}`;
        row.appendChild(valueTd);

        // Categories
        const catTd = document.createElement('td');
        catTd.textContent = driver.categories.join(', ');
        row.appendChild(catTd);

        const actionsTd = document.createElement('td');

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-edit btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
            editDriver(driver._id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-delete btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            deleteDriver(driver._id, driver.name);
        });

        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(deleteBtn);
        row.appendChild(actionsTd);

        tbody.appendChild(row);
    });
}

async function createDriver(driverData) {
    if (!isElevated) {
        showError('Elevation required to create drivers');
        return false;
    }

    try {
        const res = await fetch('/api/drivers/admin/drivers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${elevatedToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(driverData)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to create driver');
        }

        showSuccess('Driver created successfully');
        loadDrivers();
        return true;
    } catch (error) {
        console.error('Error creating driver:', error);
        showError(error.message);
        return false;
    }
}

async function updateDriver(driverId, driverData) {
    if (!isElevated) {
        showError('Elevation required to update drivers');
        return false;
    }

    try {
        const res = await fetch(`/api/drivers/admin/drivers/${driverId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${elevatedToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(driverData)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to update driver');
        }

        showSuccess('Driver updated successfully');
        loadDrivers();
        return true;
    } catch (error) {
        console.error('Error updating driver:', error);
        showError(error.message);
        return false;
    }
}

async function deleteDriverById(driverId) {
    if (!isElevated) {
        showError('Elevation required to delete drivers');
        return false;
    }

    try {
        const res = await fetch(`/api/drivers/admin/drivers/${driverId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${elevatedToken}`
            }
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to delete driver');
        }

        showSuccess('Driver deleted successfully');
        loadDrivers();
        return true;
    } catch (error) {
        console.error('Error deleting driver:', error);
        showError(error.message);
        return false;
    }
}

function editDriver(driverId) {
    const driver = drivers.find(d => d._id === driverId);
    if (!driver) {
        showError('Driver not found');
        return;
    }

    document.getElementById('driver-modal-title').textContent = 'Edit Driver';
    document.getElementById('driver-name').value = driver.name;
    document.getElementById('driver-value').value = driver.value;
    document.getElementById('driver-image').value = driver.imageURL || '';
    document.getElementById('driver-description').value = driver.description || '';
    document.getElementById('driver-submit-btn').textContent = 'Update Driver';

    const categoryCheckboxes = document.querySelectorAll('input[name="categories"]');
    categoryCheckboxes.forEach(checkbox => {
        checkbox.checked = driver.categories.includes(checkbox.value);
    });

    const form = document.getElementById('driver-form');
    form.dataset.driverId = driverId;
    form.dataset.mode = 'edit';

    openModal('driver-modal');
}

function deleteDriver(driverId, driverName) {
    showConfirmation(`Are you sure you want to delete driver "${driverName}"?`, () => {
        deleteDriverById(driverId);
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
    
    if (modalId === 'user-modal') {
        resetUserForm();
    } else if (modalId === 'driver-modal') {
        resetDriverForm();
    }
}

function resetUserForm() {
    const form = document.getElementById('user-form');
    if (form) {
        form.reset();
        delete form.dataset.userId;
        delete form.dataset.mode;
        document.getElementById('user-modal-title').textContent = 'Create User';
        document.getElementById('user-submit-btn').textContent = 'Create User';
    }
}

function resetDriverForm() {
    const form = document.getElementById('driver-form');
    if (form) {
        form.reset();
        delete form.dataset.driverId;
        delete form.dataset.mode;
        document.getElementById('driver-modal-title').textContent = 'Create Driver';
        document.getElementById('driver-submit-btn').textContent = 'Create Driver';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showInfo(message) {
    showNotification(message, 'info');
}

function showNotification(message, type) {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

function showConfirmation(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    
    const confirmBtn = document.getElementById('confirm-yes');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal('confirm-modal');
    });
    
    openModal('confirm-modal');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin page loaded, checking authentication...');
    checkAuthentication();
    restoreElevation();
    
    document.querySelectorAll('input[name="categories"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        const checked = [...document.querySelectorAll('input[name="categories"]:checked')];
        if (checked.length > 2) {
        // Uncheck the last checked box to keep only 2 selected
        checkbox.checked = false;
        alert('You can only select up to 2 categories.');
        }
    });
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    const dashboardBtn = document.querySelector('button.btn-secondary[href="/dashboard.html"]') ||
                                                    document.querySelector('button.btn-secondary:nth-of-type(1)');
    const selectDriversBtn = document.querySelector('button.btn-secondary[href="/select-drivers.html"]') ||
                                                    document.querySelector('button.btn-secondary:nth-of-type(2)');
    const loginRedirectBtn = document.querySelector('#unauthorized button.btn-primary');

    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => {
            window.location.href = '/dashboard.html';
        });
    }

    if (selectDriversBtn) {
        selectDriversBtn.addEventListener('click', () => {
            window.location.href = '/select-drivers.html';
        });
    }

    if (loginRedirectBtn) {
        loginRedirectBtn.addEventListener('click', () => {
            window.location.href = '/login.html';
        });
    }

    const createUserBtn = document.getElementById('create-user-btn');
    if (createUserBtn) {
        createUserBtn.addEventListener('click', () => {
            resetUserForm();
            openModal('user-modal');
        });
    }

    const createDriverBtn = document.getElementById('create-driver-btn');
    if (createDriverBtn) {
        createDriverBtn.addEventListener('click', () => {
            resetDriverForm();
            openModal('driver-modal');
        });
    }

    const elevateBtn = document.getElementById('elevate-btn');
    if (elevateBtn) {
        elevateBtn.addEventListener('click', () => {
            openModal('elevation-modal');
        });
    }

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close') || e.target.hasAttribute('data-modal')) {
            const modalId = e.target.getAttribute('data-modal') || 
                           e.target.closest('.modal').id;
            if (modalId) {
                closeModal(modalId);
            }
        }
        
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
            
        if (e.target.classList.contains('edit-user-btn')) {
            const userId = e.target.getAttribute('data-user-id');
            if (userId) {
                openUserModalForEdit(userId);
            }
        }

        if (e.target.classList.contains('delete-driver-btn')) {
            const driverId = e.target.getAttribute('data-driver-id');
            const driverName = e.target.getAttribute('data-driver-name');
            if (driverId) {
                deleteDriver(driverId, driverName);
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal[style*="block"]');
            if (openModal) {
                closeModal(openModal.id);
            }
        }
    });

    const elevationForm = document.getElementById('elevation-form');
    if (elevationForm) {
        elevationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const elevationKey = formData.get('elevationKey');
            
            if (await requestElevation(elevationKey)) {
                e.target.reset();
            }
        });
    }

    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const userData = {
                username: formData.get('username'),
                role: formData.get('role'),
                budget: parseFloat(formData.get('budget')) || 0
            };

            // Only include PIN if it's provided (for updates, empty PIN means no change)
            const pin = formData.get('pin');
            if (pin) {
                userData.pin = pin;
            }

            const mode = e.target.dataset.mode;
            const userId = e.target.dataset.userId;

            let success = false;
            if (mode === 'edit' && userId) {
                success = await updateUser(userId, userData);
            } else {
                // PIN is required for new users
                if (!pin) {
                    showError('PIN is required for new users');
                    return;
                }
                success = await createUser(userData);
            }

            if (success) {
                closeModal('user-modal');
            }
        });
    }

    const driverForm = document.getElementById('driver-form');
    if (driverForm) {
        driverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const categories = [];
            document.querySelectorAll('input[name="categories"]:checked').forEach(checkbox => {
                categories.push(checkbox.value);
            });

            if (categories.length === 0 || categories.length > 2) {
                showError('Please select 1 or 2 categories');
                return;
            }

            const driverData = {
                name: formData.get('name'),
                value: parseFloat(formData.get('value')) || 0,
                categories: categories
            };

            const imageURL = formData.get('imageURL');
            const description = formData.get('description');
            
            if (imageURL) driverData.imageURL = imageURL;
            if (description) driverData.description = description;

            const mode = e.target.dataset.mode;
            const driverId = e.target.dataset.driverId;

            let success = false;
            if (mode === 'edit' && driverId) {
                success = await updateDriver(driverId, driverData);
            } else {
                success = await createDriver(driverData);
            }
            if (success) {
                closeModal('driver-modal');
            }
        });
    }

    // Form validation
    const userPinInput = document.getElementById('user-pin');
    if (userPinInput) {
        userPinInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        });
    }

    const driverValueInput = document.getElementById('driver-value');
    if (driverValueInput) {
        driverValueInput.addEventListener('input', (e) => {
            if (parseFloat(e.target.value) < 0) {
                e.target.value = 0;
            }
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
});