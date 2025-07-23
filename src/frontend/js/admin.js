// Global state
let currentUser = null;
let isElevated = false;
let elevatedToken = null;
let users = [];
let drivers = [];

// Authentication and initialization
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
        updateElevationStatus();
        showElevatedActions();
        closeModal('elevation-modal');
        showSuccess('Elevation granted successfully');

        // Set timeout to handle token expiration
        setTimeout(() => {
            isElevated = false;
            elevatedToken = null;
            updateElevationStatus();
            hideElevatedActions();
            showInfo('Elevation expired. Please request elevation again if needed.');
        }, 15 * 60 * 1000); // 15 minutes

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

function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>£${user.budget}</td>
            <td>
                <button class="btn-edit" onclick="editUser('${user._id}')">Edit</button>
                <button class="btn-delete" onclick="deleteUser('${user._id}', '${user.username}')">Delete</button>
            </td>
        `;
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
    if (!user) return;

    // Populate form
    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-pin').value = '';
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-budget').value = user.budget;
    document.getElementById('user-submit-btn').textContent = 'Update User';

    // Store user ID for form submission
    document.getElementById('user-form').dataset.userId = userId;
    document.getElementById('user-form').dataset.mode = 'edit';

    openModal('user-modal');
}

function deleteUser(userId, username) {
    showConfirmation(`Are you sure you want to delete user "${username}"?`, () => {
        deleteUserById(userId);
    });
}

// Driver management
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
        row.innerHTML = `
            <td>${driver.name}</td>
            <td>${driver.value}</td>
            <td>${driver.categories.join(', ')}</td>
            <td>
                <button class="btn-edit" onclick="editDriver('${driver._id}')">Edit</button>
                <button class="btn-delete" onclick="deleteDriver('${driver._id}', '${driver.name}')">Delete</button>
            </td>
        `;
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
    if (!driver) return;

    // Populate form
    document.getElementById('driver-modal-title').textContent = 'Edit Driver';
    document.getElementById('driver-name').value = driver.name;
    document.getElementById('driver-value').value = driver.value;
    document.getElementById('driver-image').value = driver.imageURL || '';
    document.getElementById('driver-description').value = driver.description || '';
    document.getElementById('driver-submit-btn').textContent = 'Update Driver';

    // Set categories
    const categoryCheckboxes = document.querySelectorAll('input[name="categories"]');
    categoryCheckboxes.forEach(checkbox => {
        checkbox.checked = driver.categories.includes(checkbox.value);
    });

    // Store driver ID for form submission
    document.getElementById('driver-form').dataset.driverId = driverId;
    document.getElementById('driver-form').dataset.mode = 'edit';

    openModal('driver-modal');
}

function deleteDriver(driverId, driverName) {
    showConfirmation(`Are you sure you want to delete driver "${driverName}"?`, () => {
        deleteDriverById(driverId);
    });
}

// Modal management
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    
    // Reset forms when closing
    if (modalId === 'user-modal') {
        resetUserForm();
    } else if (modalId === 'driver-modal') {
        resetDriverForm();
    }
}

function resetUserForm() {
    const form = document.getElementById('user-form');
    form.reset();
    form.removeAttribute('data-user-id');
    form.removeAttribute('data-mode');
    document.getElementById('user-modal-title').textContent = 'Create User';
    document.getElementById('user-submit-btn').textContent = 'Create User';
}

function resetDriverForm() {
    const form = document.getElementById('driver-form');
    form.reset();
    form.removeAttribute('data-driver-id');
    form.removeAttribute('data-mode');
    document.getElementById('driver-modal-title').textContent = 'Create Driver';
    document.getElementById('driver-submit-btn').textContent = 'Create Driver';
}

// Notification system
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
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        color: white;
        font-weight: 600;
        z-index: 1001;
        max-width: 400px;
        word-wrap: break-word;
    `;
    
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#10b981';
            break;
        case 'error':
            notification.style.backgroundColor = '#ef4444';
            break;
        case 'info':
            notification.style.backgroundColor = '#3b82f6';
            break;
    }
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

function showConfirmation(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-yes').onclick = () => {
        onConfirm();
        closeModal('confirm-modal');
    };
    openModal('confirm-modal');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin page loaded, checking authentication...');
    checkAuthentication();
    
    // Logout functionality
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Elevation button
    const elevateBtn = document.getElementById('elevate-btn');
    if (elevateBtn) {
        elevateBtn.addEventListener('click', () => {
            openModal('elevation-modal');
        });
    }

    // Create buttons
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

    // Modal close buttons
    document.querySelectorAll('.close, [data-modal]').forEach(element => {
        element.addEventListener('click', (e) => {
            const modalId = e.target.getAttribute('data-modal') || 
                           e.target.closest('.modal').id;
            if (modalId) {
                closeModal(modalId);
            }
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    });

    // Form submissions
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
            
            // Get selected categories
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

            // Optional fields
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

    editBtn.addEventListener('click', () => editUser(user._id));

    // Form validation
    const userPinInput = document.getElementById('user-pin');
    if (userPinInput) {
        userPinInput.addEventListener('input', (e) => {
            // Only allow numbers and limit to 4 characters
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        });
    }

    const driverValueInput = document.getElementById('driver-value');
    if (driverValueInput) {
        driverValueInput.addEventListener('input', (e) => {
            // Ensure non-negative values
            if (parseFloat(e.target.value) < 0) {
                e.target.value = 0;
            }
        });
    }

    const userBudgetInput = document.getElementById('user-budget');
    if (userBudgetInput) {
        userBudgetInput.addEventListener('input', (e) => {
            // Ensure non-negative values
            if (parseFloat(e.target.value) < 0) {
                e.target.value = 0;
            }
        });
    }
});