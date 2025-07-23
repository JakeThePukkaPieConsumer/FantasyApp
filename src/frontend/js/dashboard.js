async function checkAuthentication() {
    const token = localStorage.getItem('token');
    
    // Hide loading and show unauthorized if no token
    if (!token) {
        console.log('No token found');
        showUnauthorized();
        return;
    }

    try {
        console.log('Verifying token...');
        const res = await fetch('/api/auth/user/verify', {  // Fixed path
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

        if (data.user) {
            displayUserInfo(data.user);
        } else {
            console.error('No user data in response');
            throw new Error('No user data received');
        }

    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('token');
        showUnauthorized();
    }
}

function displayUserInfo(user) {
    console.log('Displaying user info:', user);
    
    // Update budget display
    const budgetElement = document.getElementById('budget-display');
    if (budgetElement) {
        budgetElement.textContent = user.budget || '0';
    }

    // Hide loading and unauthorized, show dashboard
    hideLoading();
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('unauthorized').style.display = 'none';

    // Show admin panel button if user is admin
    const adminBtn = document.getElementById('admin-panel-btn');
    if (adminBtn) {
        if (user.role && user.role.toLowerCase() === 'admin') {
            adminBtn.style.display = 'inline-block';
        } else {
            adminBtn.style.display = 'none';
        }
    }
}

function showUnauthorized() {
    console.log('Showing unauthorized message');
    hideLoading();
    document.getElementById('dashboard').style.display = 'none';
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
    window.location.href = '/login.html';  // Fixed to include .html
}

// Check authentication when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard page loaded, checking authentication...');
    checkAuthentication();
    
    // Add logout functionality
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});