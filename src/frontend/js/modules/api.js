class ApiModule {
    constructor(authModule) {
        this.authModule = authModule;
        this.baseURL = '';
    }

    getHeaders(includeAuth = true, customHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...customHeaders
        };

        if (includeAuth) {
            const token = this.authModule.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        return headers;
    }

    async request(endpoint, options = {}) {
        const {
            method = 'GET',
            data,
            headers = {},
            includeAuth = true,
            cache = 'no-store'
        } = options;

        const requestOptions = {
            method,
            headers: this.getHeaders(includeAuth, headers),
            cache
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestOptions.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, requestOptions);
            
            const contentType = response.headers.get('content-type');
            let responseData;
            
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                responseData = await response.text();
            }

            if (!response.ok) {
                const errorMessage = responseData?.message || responseData?.error || responseData || 'Request failed';
                throw new Error(errorMessage);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };

        } catch (error) {
            console.error(`API request failed: ${method} ${endpoint}`, error);
            return {
                success: false,
                error: error.message,
                status: error.status || 0
            };
        }
    }
    
    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    async post(endpoint, data, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', data });
    }

    async put(endpoint, data, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', data });
    }

    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }

    async patch(endpoint, data, options = {}) {
        return this.request(endpoint, { ...options, method: 'PATCH', data });
    }
}

class UserApi extends ApiModule {
    constructor(authModule, elevationModule) {
        super(authModule);
        this.elevationModule = elevationModule
    }
    async getUsers() {
        return this.get('/api/auth/user/users');
    }

    async createUser(userData, elevatedToken) {
        return this.post('/api/admin/users/users', userData, {
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async updateUser(userId, userData, elevatedToken) {
        return this.put(`/api/admin/users/${userId}`, userData, {
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async deleteUser(userId, elevatedToken) {
        return this.delete(`/api/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async requestElevation(elevationKey) {
        return this.post('/api/admin/users/elevate', { elevationKey });
    }
}

class DriverApi extends ApiModule {
    constructor(authModule, elevationModule) {
        super(authModule)
        this.elevationModule = elevationModule
    }

    async getDrivers() {
        return this.get('/api/drivers/drivers');
    }

    async createDriver(driverData, elevatedToken) {
        return this.post('/api/drivers/admin/drivers', driverData, {
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async updateDriver(driverId, driverData, elevatedToken) {
        return this.put(`/api/drivers/admin/drivers/${driverId}`, driverData, {
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async deleteDriver(driverId, elevatedToken) {
        return this.delete(`/api/drivers/admin/drivers/${driverId}`, {
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }
}

function createApiModules(authModule, elevationModule) {
    return {
        users: new UserApi(authModule, elevationModule),
        drivers: new DriverApi(authModule, elevationModule)
    };
}

export { ApiModule, UserApi, DriverApi, createApiModules };