const checkAuthentication = async function() {
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

module.exports = { checkAuthentication };