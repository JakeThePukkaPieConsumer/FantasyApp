class ApiModule {
    constructor(authModule) {
        this.authModule = authModule;
        this.baseURL = '';
        this.currentYear = new Date().getFullYear().toString();
    }

    setCurrentYear(year) {
        this.currentYear = year;
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

class AuthApi extends ApiModule {
    constructor(authModule) {
        super(authModule);
    }

    async login(username, pin, year = null) {
        const loginData = { username, pin };
        if (year) {
            loginData.year = year;
        }

        return this.post('/auth/api/login', loginData, { includeAuth: false });
    }

    async verify() {
        return this.get('/api/auth/verify');
    }

    async getCurrentUsers() {
        return this.get('/api/auth');
    }

    async getUsersByYear(year, options = {}) {
        const { role, sort = 'username', order = 'asc'} = options;
        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (sort) params.append('sort', sort);
        if (order) params.append('order', order);

        const queryString = params.toString();
        const endpoint = `/api/auth/${year}${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }

    async getAvailableYears() {
        return this.get('/api/auth/years');
    }

    async getUserById(year, userId) {
        return this.get(`/api/auth/${year}/${userId}`);
    }

    async searchUsers(query, year = null) {
        const params = new URLSearchParams();
        if (year) params.append('year', year);

        const queryString = params.toString();
        const endpoint = `/api/auth/search/${encodeURIComponent(query)}${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }
}

class UserApi extends ApiModule {
    constructor(authModule, elevationModule) {
        super(authModule);
        this.elevationModule = elevationModule;
    }

    async getUsers(year = null, options = {}) {
        const { role, sort = 'username', order = 'asc' } = options;
        const params = new URLSearchParams();
        if (year) params.append('year', year);
        if (role) params.append('role', role);
        if (sort) params.append('sort', sort);
        if (order) params.append('order', order);

        const queryString = params.toString();
        const endpoint = `/api/user/${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }

    async getUserById(userId, year = null) {
        const params = new URLSearchParams();
        if (year) params.append('year', year);
        
        const queryString = params.toString();
        const endpoint = `/api/user/${userId}${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }

    async createUser(userData, elevatedToken, year = null) {
        const data = { ...userData };
        if (year) {
            data.year = year;
        }
        
        return this.post('/api/user/users', data, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async updateUser(userId, userData, elevatedToken, year = null) {
        const data = { ...userData };
        if (year) {
            data.year = year;
        }
        
        return this.put(`/api/user/${userId}`, data, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async deleteUser(userId, elevatedToken, year = null) {
        const params = new URLSearchParams();
        if (year) params.append('year', year);
        
        const queryString = params.toString();
        const endpoint = `/api/user/${userId}${queryString ? `?${queryString}` : ''}`;
        
        return this.delete(endpoint, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async resetUserPin(userId, newPin, elevatedToken, year = null) {
        const data = { newPin };
        if (year) {
            data.year = year;
        }
        
        return this.post(`/api/user/${userId}/reset-pin`, data, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async getUserStats(year = null) {
        const params = new URLSearchParams();
        if (year) params.append('year', year);
        
        const queryString = params.toString();
        const endpoint = `/api/user/stats${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }

    async requestElevation(elevationKey) {
        return this.post('/api/user/elevate', { elevationKey });
    }
}

class DriverApi extends ApiModule {
    constructor(authModule, elevationModule) {
        super(authModule);
        this.elevationModule = elevationModule;
    }

    async getAvailableYears() {
        return this.get('/api/driver/');
    }

    async getDrivers(year, options = {}) {
        const { category, sort = 'name', order = 'asc' } = options;
        const params = new URLSearchParams();
        if (category) params.append('category', category);
        if (sort) params.append('sort', sort);
        if (order) params.append('order', order);
        
        const queryString = params.toString();
        const endpoint = `/api/driver/${year}${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }

    async getDriverById(year, driverId) {
        return this.get(`/api/driver/${year}/${driverId}`);
    }

    async createDriver(year, driverData, elevatedToken) {
        return this.post(`/api/driver/${year}`, driverData, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async updateDriver(year, driverId, driverData, elevatedToken) {
        return this.put(`/api/driver/${year}/${driverId}`, driverData, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async deleteDriver(year, driverId, elevatedToken) {
        return this.delete(`/api/driver/${year}/${driverId}`, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async getDriverStats(year) {
        return this.get(`/api/driver/${year}/stats`);
    }
}

class RosterApi extends ApiModule {
    constructor(authModule) {
        super(authModule);
    }

    async getRosters(year, options = {}) {
        const { user, race, sort = 'createdAt', order = 'desc' } = options;
        const params = new URLSearchParams();
        if (user) params.append('user', user);
        if (race) params.append('race', race);
        if (sort) params.append('sort', sort);
        if (order) params.append('order', order);
        
        const queryString = params.toString();
        const endpoint = `/api/roster/${year}${queryString ? `?${queryString}` : ''}`;
        return this.get(endpoint);
    }

    async getRosterById(year, rosterId) {
        return this.get(`/api/roster/${year}/${rosterId}`);
    }

    async createRoster(year, rosterData) {
        return this.post(`/api/roster/${year}`, rosterData);
    }

    async updateRoster(year, rosterId, rosterData) {
        return this.put(`/api/roster/${year}/${rosterId}`, rosterData);
    }

    async deleteRoster(year, rosterId) {
        return this.delete(`/api/roster/${year}/${rosterId}`);
    }

    async getRosterStats(year) {
        return this.get(`/api/roster/${year}/stats`);
    }

    async getUserRosters(year, userId) {
        return this.get(`/api/roster/${year}/user/${userId}`);
    }
}

class YearApi extends ApiModule {
    constructor(authModule, elevationModule) {
        super(authModule);
        this.elevationModule = elevationModule;
    }

    async getAvailableYears() {
        return this.get('/api/year/');
    }

    async getAllYearStats() {
        return this.get('/api/year/stats');
    }

    async getYearStats(year) {
        return this.get(`/api/year/${year}/stats`);
    }

    async initializeYear(year, elevatedToken) {
        return this.post(`/api/year/${year}/initialize`, {}, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async copyYearData(sourceYear, targetYear, collections, elevatedToken) {
        const data = { sourceYear, targetYear, collections };
        return this.post('/api/year/copy', data, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` }
        });
    }

    async compareYears(year1, year2) {
        return this.get(`/api/year/${year1}/compare/${year2}`);
    }

    async deleteYear(year, elevatedToken) {
        const data = { confirmDelete: 'DELETE_ALL_DATA' };
        return this.delete(`/api/year/${year}`, {
            includeAuth: false,
            headers: { 'Authorization': `Bearer ${elevatedToken}` },
            data
        });
    }
}

function createApiModules(authModule, elevationModule) {
    return {
        auth: new AuthApi(authModule),
        users: new UserApi(authModule, elevationModule),
        drivers: new DriverApi(authModule, elevationModule),
        rosters: new RosterApi(authModule),
        years: new YearApi(authModule, elevationModule)
    };
}

class YearManager {
    constructor(apiModules) {
        this.api = apiModules;
        this.currentYear = new Date().getFullYear().toString();
        this.availableYears = [];
    }

    async initialize() {
        await this.loadAvailableYears();
        return this;
    }

    async loadAvailableYears() {
        try {
            const result = await this.api.years.getAvailableYears();
            if (result.success) {
                this.availableYears = result.data.years || [];
            }
        } catch (error) {
            console.error('Failed to load available years:', error);
        }
    }

    getCurrentYear() {
        return this.currentYear;
    }

    setCurrentYear(year) {
        this.currentYear = year;
        Object.values(this.api).forEach(apiModule => {
            if (apiModule.setCurrentYear) {
                apiModule.setCurrentYear(year);
            }
        });
    }

    getAvailableYears() {
        return [...this.availableYears];
    }

    isValidYear(year) {
        return /^\d{4}$/.test(year) && parseInt(year) >= 2020 && parseInt(year) <= 2030;
    }

    async switchToYear(year) {
        if (!this.isValidYear(year)) {
            throw new Error('Invalid year format');
        }
        
        this.setCurrentYear(year);
        return year;
    }

    async createNewYear(year, sourceYear = null, collections = ['drivers', 'users']) {
        if (!this.isValidYear(year)) {
            throw new Error('Invalid year format');
        }

        const initResult = await this.api.years.initializeYear(year, elevatedToken);
        if (!initResult.success) {
            throw new Error(initResult.error);
        }

        if (sourceYear && this.isValidYear(sourceYear)) {
            const copyResult = await this.api.years.copyYearData(
                sourceYear, 
                year, 
                collections, 
                elevatedToken
            );
            if (!copyResult.success) {
                throw new Error(copyResult.error);
            }
        }

        await this.loadAvailableYears();
        return year;
    }

    formatYearForDisplay(year) {
        return `${year} Season`;
    }

    getYearsList() {
        return this.availableYears.map(yearData => ({
            year: yearData.year,
            display: this.formatYearForDisplay(yearData.year),
            hasData: yearData.driverCount > 0 || yearData.userCount > 0
        }));
    }
}

export { 
    ApiModule, 
    AuthApi, 
    UserApi, 
    DriverApi, 
    RosterApi,  
    YearApi, 
    YearManager,
    createApiModules 
};