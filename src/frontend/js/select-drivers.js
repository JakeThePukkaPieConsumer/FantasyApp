import authModule from './modules/auth.js'
import { createApiModules } from './modules/api.js'
import notificationModule from './modules/notification.js'

class DriverSelection {
    constructor() {
        this.apiModules = createApiModules(authModule);
        this.currentUser = null;
        this.drivers = [];
        this.selectedDrivers = [];
        this.filteredDrivers = [];
        this.currentFilter = 'all';
        this.maxDrivers = 6;
        this.sortByValue = false;
    }

    async init() {
        console.log('Initializing driver selection...');

        try {
            await this.checkAuthentication();
            await this.loadDrivers();
            this.setupEventListeners();
            this.showDriverSelection();
        } catch (err) {
            console.error('Failed to initialize driver selection:', err);
            this.showUnauthorized();
        }
    }

    async checkAuthentication() {
        const authResult = await authModule.checkAuthentication();
        
        if (!authResult.success) {
            console.log('Authentication failed:', authResult.error);
            throw new Error('Not authenticated');
        }

        this.currentUser = authResult.user;
        console.log('Driver selection authentication successful');
    }

    async loadDrivers() {
        try {
            const result = await this.apiModules.drivers.getDrivers();

            if (!result.success) throw new Error(result.error);

            this.drivers = result.data.drivers || [];
            this.filteredDrivers = [...this.drivers];
            console.log(`Loaded ${this.drivers.length} drivers`);
        } catch (err) {
            console.error('Error loading drivers:', err);
            notificationModule.error('Failed to load drivers');
            throw err;
        }
    }

    setupEventListeners() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                authModule.logout();
            });
        }

        const saveTeamBtn = document.getElementById('save-team-btn')
        if (saveTeamBtn) {
            saveTeamBtn.addEventListener('click', () => this.saveTeam());
        }

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveFilter(e.target);
                this.filteredDrivers(e.target.dataset.category);
            });
        });

        const searchInput = document.getElementById('search-drivers');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchDrivers(e.target.value);
            });
        }   

        const sortBtn = document.getElementById('sort-by-value');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => {
                this.sortByValue = !this.sortByValue;
                sortBtn.textContent = this.sortByValue ? 'Sort by Name' : 'Sort by Value';
                this.renderDrivers();
            });
        }

        console.log('Driver selection event listeners set up');
    }

    setActiveFilter(activeBtn) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }

    filterDrivers(category) {
        this.currentFilter = category;

        if (category === 'all') {
            this.filterDrivers = [...this.drivers];
        } else {
            this.filterDrivers = this.drivers.filter(driver => 
                driver.categories.includes(category)
            );
        }

        this.renderDrivers();
    }

    searchDrivers(query) {
        const lowerQuery = query.toLowerCase().trim();

        if (!lowerQuery) {
            this.filterDrivers(this.currentFilter);
            return;
        }

        this.filteredDrivers = this.drivers.filter(driver => {
            const matchesSearch = driver.name.toLowerCase().includes(lowerQuery);
            const matchesCategory = this.currentFilter === 'all' || 
                                    driver.categories.includes(this.currentFilter);

            return matchesSearch && matchesCategory;
        });

        this.renderDrivers();
    }

    renderDrivers() {
        const driversGrid = document.getElementById('drivers-grid');
        const noDriversMessage = document.getElementById('no-drivers');

        if (!driversGrid) return;

        let driversToRender = [...this.filteredDrivers];
        if (this.sortByValue) {
            driversToRender.sort((a, b) => b.value - a.value);
        } else {
            driversToRender.sort((a, b) => a.name.localeCompare(b.name));
        }

        driversGrid.innerHTML = '';

        if (driversToRender.length === 0) {
            noDriversMessage.style.display = 'block';
            return;
        }

        noDriversMessage.style.display = 'none';

        driversToRender.forEach(driver => {
            const driverCard = this.createDriverCard(driver);
            driversGrid.appendChild(driverCard);
        });
    }

    createDriverCard(driver) {
        const template = document.getElementById('driver-card-template');
        const card = template.content.cloneNode(true);
        
        const cardElement = card.querySelector('.driver-card');
        const image = card.querySelector('.driver-image');
        const categoriesContainer = card.querySelector('.driver-categories');
        const name = card.querySelector('.driver-name');
        const value = card.querySelector('.driver-value');
        const description = card.querySelector('.driver-description');
        const selectBtn = card.querySelector('.select-driver-btn');
        const removeBtn = card.querySelector('.remove-driver-btn');

        cardElement.dataset.driverId = driver._id;
        cardElement.dataset.categories = driver.categories.join(',');
        cardElement.dataset.value = driver.value;

        if (driver.imageURL) {
            image.src = driver.imageURL;
        }
        image.alt = `${driver.name} photo`;

        categoriesContainer.innerHTML = '';
        driver.categories.forEach(category => {
            const badge = document.createElement('span');
            badge.className = 'category-badge';
            badge.textContent = category;
            categoriesContainer.appendChild(badge);
        });

        name.textContent = driver.name;
        value.textContent = `£${authModule.formatCurrency(driver.value)}`;
        description.textContent = driver.description || 'No description available.';

        const isSelected = this.selectedDrivers.some(d => d._id === driver._id);
        const canAfford = this.currentUser.budget - this.getTeamValue() >= driver.value;
        const teamFull = this.selectedDrivers.length >= this.maxDrivers;

        if (isSelected) {
            cardElement.classList.add('selected');
            selectBtn.style.display = 'none';
            removeBtn.style.display = 'inline-flex';
        } else {
            cardElement.classList.remove('selected');
            selectBtn.style.display = 'inline-flex';
            removeBtn.style.display = 'none';

            if (!canAfford || teamFull) {
                cardElement.classList.add('disabled');
                selectBtn.disabled = true;
                selectBtn.textContent = !canAfford ? 'Cannot Afford' : 'Team Full';
            } else {
                cardElement.classList.remove('disabled');
                selectBtn.disabled = false;
                selectBtn.textContent = 'Select Driver';
            }
        }

        selectBtn.addEventListener('click', () => this.selectDriver(driver));
        removeBtn.addEventListener('click', () => this.removeDriver(driver._id));

        return card;
    }

    selectDriver(driver) {
        if (this.selectedDrivers.length >= this.maxDrivers) {
            notificationModule.warning(`You can only select ${this.maxDrivers} drivers.`);
            return;
        }

        const totalCost = this.getTeamValue() + driver.value;
        if (totalCost > this.currentUser.budget) {
            notificationModule.warning('Not enough budget to select this driver.');
            return;
        }

        this.selectedDrivers.push(driver);
        this.updateTeamStats();
        this.renderDrivers();
        this.renderSelectedDrivers();
        
        notificationModule.success(`${driver.name} added to your team!`);
    }

    removeDriver(driverId) {
        this.selectedDrivers = this.selectedDrivers.filter(d => d._id !== driverId);
        this.updateTeamStats();
        this.renderDrivers();
        this.renderSelectedDrivers();
        
        const driver = this.drivers.find(d => d._id === driverId);
        if (driver) {
            notificationModule.info(`${driver.name} removed from your team.`);
        }
    }

    renderSelectedDrivers() {
        const selectedGrid = document.getElementById('selected-drivers-grid');
        const selectedSection = document.getElementById('selected-drivers-section');
        
        if (!selectedGrid || !selectedSection) return;

        if (this.selectedDrivers.length === 0) {
            selectedSection.style.display = 'none';
            return;
        }

        selectedSection.style.display = 'block';
        selectedGrid.innerHTML = '';

        this.selectedDrivers.forEach(driver => {
            const driverCard = this.createSelectedDriverCard(driver);
            selectedGrid.appendChild(driverCard);
        });
    }

    createSelectedDriverCard(driver) {
        const card = document.createElement('div');
        card.className = 'driver-card selected';
        card.innerHTML = `
            <div class="driver-image-container">
                <img class="driver-image" src="${driver.imageURL || ''}" alt="${driver.name} photo" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik01MCA1OEM1Ni42Mjc0IDU4IDYyIDUyLjYyNzQgNjIgNDZDNjIgMzkuMzcyNiA1Ni42Mjc0IDM0IDUwIDM0QzQzLjM3MjYgMzQgMzggMzkuMzcyNiAzOCA0NkMzOCA1Mi42Mjc0IDQzLjM3MjYgNTggNTAgNThaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yNiA3NEMyNiA2NS4xNjM0IDMzLjE2MzQgNTggNDIgNThINThDNjYuODM2NiA1OCA3NCA2NS4xNjM0IDc0IDc0VjgySDI2Vjc0WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K'">
                <div class="driver-categories">
                    ${driver.categories.map(cat => `<span class="category-badge">${cat}</span>`).join('')}
                </div>
            </div>
            <div class="driver-info">
                <h4 class="driver-name">${driver.name}</h4>
                <p class="driver-value">£${authModule.formatCurrency(driver.value)}</p>
            </div>
            <div class="driver-actions">
                <button class="btn btn-danger btn-sm remove-driver-btn">
                    Remove
                </button>
            </div>
        `;

        const removeBtn = card.querySelector('.remove-driver-btn');
        removeBtn.addEventListener('click', () => this.removeDriver(driver._id));

        return card;
    }

    updateTeamStats() {
        const teamValue = this.getTeamValue();
        const budgetRemaining = this.currentUser.budget - teamValue;
        const selectedCount = this.selectedDrivers.length;
        const isComplete = selectedCount === this.maxDrivers;

        document.getElementById('selected-count').textContent = selectedCount;
        document.getElementById('budget-remaining').textContent = authModule.formatCurrency(budgetRemaining);
        document.getElementById('team-value').textContent = authModule.formatCurrency(teamValue);
        document.getElementById('team-status').textContent = isComplete ? 'Complete' : 'Incomplete';
        document.getElementById('budget-used').textContent = authModule.formatCurrency(teamValue);

        const saveBtn = document.getElementById('save-team-btn');
        if (saveBtn) {
            saveBtn.disabled = !isComplete;
        }

        const teamStatusElement = document.getElementById('team-status');
        if (teamStatusElement) {
            teamStatusElement.style.color = isComplete ? 'var(--success-color)' : 'var(--warning-color)';
        }
    }

    getTeamValue() {
        return this.selectedDrivers.reduce((total, driver) => total + driver.value, 0);
    }

    async saveTeam() {
        if (this.selectedDrivers.length !== this.maxDrivers) {
            notificationModule.warning(`Please select exactly ${this.maxDrivers} drivers before saving.`);
            return;
        }

        const teamValue = this.getTeamValue();
        if (teamValue > this.currentUser.budget) {
            notificationModule.error('Team value exceeds your budget.');
            return;
        }

        try {
            notificationModule.showLoading('Saving your team...', { duration: 2000 });
            
            setTimeout(() => {
                notificationModule.hideLoading();
                notificationModule.success('Team saved successfully!');
            }, 2000);

        } catch (error) {
            console.error('Error saving team:', error);
            notificationModule.error('Failed to save team. Please try again.');
        }
    }

    showDriverSelection() {
        const loading = document.getElementById('loading');
        const unauthorized = document.getElementById('unauthorized');
        const driverSelection = document.getElementById('driver-selection');

        if (loading) loading.style.display = 'none';
        if (unauthorized) unauthorized.style.display = 'none';
        if (driverSelection) driverSelection.style.display = 'block';

        this.updateUserInfo();
        this.renderDrivers();
        this.updateTeamStats();

        console.log('Driver selection displayed');
    }

    showUnauthorized() {
        const loading = document.getElementById('loading');
        const driverSelection = document.getElementById('driver-selection');
        const unauthorized = document.getElementById('unauthorized');

        if (loading) loading.style.display = 'none';
        if (driverSelection) driverSelection.style.display = 'none';
        if (unauthorized) unauthorized.style.display = 'block';
    }

    updateUserInfo() {
        if (!this.currentUser) return;

        authModule.updateBudgetDisplays(this.currentUser.budget);
        console.log('User info updated for driver selection:', this.currentUser.username);
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getSelectedDrivers() {
        return [...this.selectedDrivers];
    }

    getAvailableDrivers() {
        return this.drivers.filter(driver => 
            !this.selectedDrivers.some(selected => selected._id === driver._id)
        );
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Driver selection DOM loaded');
    
    const driverSelection = new DriverSelection();
    await driverSelection.init();
    
    window.driverSelection = driverSelection;
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.driverSelection) {
        authModule.checkAuthentication().then(result => {
            if (!result.success) {
                authModule.logout();
            }
        });
    }
});