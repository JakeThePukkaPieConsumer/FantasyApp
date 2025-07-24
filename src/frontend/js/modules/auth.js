class AuthModule {
    constructor() {
        this.currentUser = null;
        this.token = null;
    }

    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('token');
        }
        return this.token;
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    removeToken() {
        this.token = null;
        localStorage.removeItem('token');
    }

    getCurrentUser() {
        return this.currentUser;
    }

    setCurrentUser(user) {
        this.currentUser = user;
    }

    async checkAuthentication() {
        const token = this.getToken();
        
        if (!token) {
            console.log('No token found');
            return { success: false, error: 'No token found' };
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
                this.removeToken();
                return { success: false, error: 'Token verification failed' };
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
                this.setCurrentUser(data.user);
                return { success: true, user: data.user };
            } else {
                console.error('No user data in response');
                throw new Error('No user data received');
            }

        } catch (error) {
            console.error('Auth check failed:', error);
            this.removeToken();
            return { success: false, error: error.message };
        }
    }

    async login(username, pin) {
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

            this.setToken(data.token);
            this.setCurrentUser(data.user);
            
            return { success: true, user: data.user };

        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    logout() {
        console.log('Logging out user');
        this.removeToken();
        this.setCurrentUser(null);
        window.location.href = '/login.html';
    }

    async loadUsers() {
        try {
            const res = await fetch('/api/auth/user/users', {
                cache: 'no-store'
            });
            const users = await res.json();

            // Sort users alphabetically
            users.sort((a, b) => a.username.localeCompare(b.username));
            
            return { success: true, users };

        } catch (error) {
            console.error('Error loading users:', error);
            return { success: false, error: 'Failed to load users' };
        }
    }

    isAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    }

    validateLoginForm(username, pin) {
        if (!username || username.trim() === '') {
            return { valid: false, error: 'Please select your name from the dropdown.' };
        }

        if (!pin || pin.trim() === '') {
            return { valid: false, error: 'Please enter your PIN.' };
        }

        if (pin.length !== 4) {
            return { valid: false, error: 'PIN must be exactly 4 digits.' };
        }

        if (!/^\d{4}$/.test(pin)) {
            return { valid: false, error: 'PIN must contain only numbers.' };
        }

        return { valid: true };
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount || 0);
    }

    updateBudgetDisplays(budget) {
        const budgetElements = document.querySelectorAll('#budget-display, #budget-stat');
        budgetElements.forEach(element => {
            if (element) {
                element.textContent = this.formatCurrency(budget);
            }
        });
    }
}

const authModule = new AuthModule();
export default authModule;