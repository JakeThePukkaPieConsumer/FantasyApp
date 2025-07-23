// Global variables
let currentUser = null;

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

        if (data.success && data.user) {
            currentUser = data.user;
            await displayUserInfo(data.user);
            await loadDashboardData();
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

async function loadDashboardData() {
    if (!currentUser) return;

    try {
        // Update budget displays
        updateBudgetDisplays(currentUser.budget);
        
        // You can add more dashboard data loading here
        // For example: load user's current team, statistics, etc.
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function updateBudgetDisplays(budget) {
    const budgetElements = document.querySelectorAll('#budget-display, #budget-stat');
    budgetElements.forEach(element => {
        if (element) {
            element.textContent = formatCurrency(budget || 0);
        }
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

async function displayUserInfo(user) {
    console.log('Displaying user info:', user);
    
    // Update budget display
    updateBudgetDisplays(user.budget);

    // Hide loading and unauthorized, show dashboard
    hideLoading();
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('unauthorized').style.display = 'none';

    // Show admin panel button if user is admin
    const adminBtn = document.getElementById('admin-panel-btn');
    if (adminBtn) {
        if (user.role && user.role.toLowerCase() === 'admin') {
            adminBtn.style.display = 'inline-flex';
        } else {
            adminBtn.style.display = 'none';
        }
    }

    // Update welcome message (if you want to personalize it)
    const welcomeMessage = document.querySelector('.dashboard-welcome h2');
    if (welcomeMessage) {
        welcomeMessage.textContent = `Welcome back, ${user.username}!`;
    }
}

function showUnauthorized() {
    console.log('Showing unauthorized message');
    hideLoading();
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('unauthorized').style.display = 'flex';
}

function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

function logout() {
    console.log('Logging out user');
    
    // Show loading state briefly
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.textContent = 'Logging out...';
        logoutBtn.disabled = true;
    }
    
    // Clear token and redirect
    localStorage.removeItem('token');
    
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}

// Placeholder function for team history
function viewTeamHistory() {
    alert('Team history feature coming soon!');
    // TODO: Implement team history modal or page
}

// Add some interactivity to stat cards
function animateStatCards() {
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 100);
        }, index * 100);
    });
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
    // Alt + D for Dashboard (already on dashboard)
    if (event.altKey && event.key === 'd') {
        event.preventDefault();
        console.log('Already on dashboard');
    }
    
    // Alt + S for Select Drivers
    if (event.altKey && event.key === 's') {
        event.preventDefault();
        window.location.href = '/select-drivers.html';
    }
    
    // Alt + A for Admin (if admin)
    if (event.altKey && event.key === 'a' && currentUser?.role === 'admin') {
        event.preventDefault();
        window.location.href = '/admin.html';
    }
    
    // Alt + L for Logout
    if (event.altKey && event.key === 'l') {
        event.preventDefault();
        logout();
    }
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
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Animate stat cards after a short delay
    setTimeout(animateStatCards, 1000);
});