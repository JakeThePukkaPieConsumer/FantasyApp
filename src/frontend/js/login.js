// Global variables
let isLoading = false;

async function loadUsers() {
    try {
        const res = await fetch('/api/auth/user/users', {
            cache: 'no-store'
        });
        const users = await res.json();

        const select = document.getElementById('username');
        select.innerHTML = '<option value="" disabled selected>Select your name</option>';

        // Sort users alphabetically
        users.sort((a, b) => a.username.localeCompare(b.username));

        // Populate options
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.username;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users. Please refresh the page.');
    }
}

async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const res = await fetch('/api/auth/user/verify', {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                cache: 'no-store'
            });
            
            if (res.ok) {
                window.location.href = '/dashboard.html';
                return;
            } else {
                localStorage.removeItem('token');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('token');
        }
    }
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

function hideError() {
    const errorElement = document.getElementById('error-message');
    errorElement.style.display = 'none';
}

function setLoading(loading) {
    isLoading = loading;
    const loginBtn = document.getElementById('login-btn');
    const loginText = document.getElementById('login-text');
    const loginSpinner = document.getElementById('login-spinner');
    
    if (loading) {
        loginBtn.disabled = true;
        loginText.textContent = 'Signing In...';
        loginSpinner.style.display = 'block';
    } else {
        loginBtn.disabled = false;
        loginText.textContent = 'Sign In';
        loginSpinner.style.display = 'none';
    }
}

function validateForm(username, pin) {
    if (!username || username.trim() === '') {
        showError('Please select your name from the dropdown.');
        return false;
    }

    if (!pin || pin.trim() === '') {
        showError('Please enter your PIN.');
        return false;
    }

    if (pin.length !== 4) {
        showError('PIN must be exactly 4 digits.');
        return false;
    }

    if (!/^\d{4}$/.test(pin)) {
        showError('PIN must contain only numbers.');
        return false;
    }

    return true;
}

async function handleLogin(event) {
    event.preventDefault();
    
    if (isLoading) return;

    const username = document.getElementById('username').value;
    const pin = document.getElementById('pin').value;

    hideError();

    if (!validateForm(username, pin)) {
        return;
    }

    setLoading(true);

    try {
        const res = await fetch('/api/auth/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), pin }),
            cache: 'no-store'
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // Store token and redirect
        localStorage.setItem('token', data.token);
        
        // Add a small delay for better UX
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 500);

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please check your credentials and try again.');
    } finally {
        setLoading(false);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already authenticated
    checkAuthStatus();
    
    // Load users for dropdown
    loadUsers();
    
    // Add form submission handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Add PIN input restrictions
    const pinInput = document.getElementById('pin');
    if (pinInput) {
        pinInput.addEventListener('input', (e) => {
            // Only allow digits
            e.target.value = e.target.value.replace(/\D/g, '');
            
            // Limit to 4 characters
            if (e.target.value.length > 4) {
                e.target.value = e.target.value.slice(0, 4);
            }
        });
        
        // Submit form on Enter key
        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin(e);
            }
        });
    }
    
    // Focus on username dropdown when page loads
    const usernameSelect = document.getElementById('username');
    if (usernameSelect) {
        setTimeout(() => {
            usernameSelect.focus();
        }, 100);
    }
});