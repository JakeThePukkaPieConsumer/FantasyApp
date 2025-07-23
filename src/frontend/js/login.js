async function loadUsers() {
    try {
        const res = await fetch('/api/user/users', {
            cache: 'no-store'
        });
        const users = await res.json();

        const select = document.getElementById('username');

        select.innerHTML = '<option value="" disabled selected>Select name</option>';

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
    }
}

async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const res = await fetch('/api/user/verify', {
                headers: { 'Authorization': `Bearer ${token}`, cache: 'no-store' }
            });
            
            if (res.ok) {
                window.location.href = 'dashboard.html';
            } else {
                localStorage.removeItem('token');
            }
        } catch (error) {
            localStorage.removeItem('token');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    loadUsers();
});

document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const pin = document.getElementById('pin').value;

    const error = document.getElementById('error-message');
    error.style.display = 'none';

    if (!username) {
        error.textContent = 'Please select a username.';
        error.style.display = 'block';
        return;
    }

    if (!pin) {
        error.textContent = 'Please enter your pin.';
        error.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin }),
            cache: 'no-store'
        });

        const data = await res.json();

        if (!res.ok) {
            error.textContent = data.message || 'Login failed';
            error.style.display = 'block';
            return;
        }

        localStorage.setItem('token', data.token);
        window.location.href = 'dashboard.html';
    } catch (err) {
        error.textContent = 'Something went wrong. Please try again.';
        error.style.display = 'block';
        console.error('Unexpected error:', err);
    }
});