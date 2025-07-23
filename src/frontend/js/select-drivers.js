// Global variables
let currentUser = null;
let allDrivers = [];
let selectedDrivers = [];
let filteredDrivers = [];
let currentFilter = 'all';

async function checkAuthentication() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        showUnauthorized();
        return;
    }

    try {
        const res = await fetch('/api/auth/user/verify', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            localStorage.removeItem('token');
            showUnauthorized();
            return;
        }

        const data = await res.json();

        if (data.success && data.user) {
            currentUser = data.user;
            displayDriverSelection();
            await loadDrivers();
            updateBudgetDisplay();
        } else {
            throw new Error('No user data received');
        }

    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('token');
        showUnauthorized();
    }
}

function displayDriverSelection() {
    hideLoading();
    document.getElementById('driver-selection').style.display = 'block';
    document.getElementById('unauthorized').style.display = 'none';
}

function showUnauthorized() {
    hideLoading();
    document.getElementById('driver-selection').style.display = 'none';
    document.getElementById('unauthorized').style.display = 'flex';
}

function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

async function loadDrivers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/drivers/drivers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error('Failed to load drivers');
        }

        const data = await res.json();
        allDrivers = data.drivers || [];
        filteredDrivers = [...allDrivers];
        
        renderDrivers();
        
    } catch (error) {
        console.error('Error loading drivers:', error);
        showAlert('Failed to load drivers', 'error');
    }
}

function renderDrivers() {
    const driversGrid = document.getElementById('drivers-grid');
    const noDrivers = document.getElementById('no-drivers');
    
    if (filteredDrivers.length === 0) {
        driversGrid.style.display = 'none';
        noDrivers.style.display = 'block';
        return;
    }
    
    driversGrid.style.display = 'grid';
    noDrivers.style.display = 'none';
    driversGrid.innerHTML = '';
    
    filteredDrivers.forEach(driver => {
        const driverCard = createDriverCard(driver);
        driversGrid.appendChild(driverCard);
    });
}

function createDriverCard(driver) {
    const template = document.getElementById('driver-card-template');
    const card = template.content.cloneNode(true);
    
    const cardElement = card.querySelector('.driver-card');
    cardElement.setAttribute('data-driver-id', driver._id);
    cardElement.setAttribute('data-categories', driver.categories.join(','));
    cardElement.setAttribute('data-value', driver.value);
    
    // Set driver image
    const image = card.querySelector('.driver-image');
    if (driver.imageURL) {
        image.src = driver.imageURL;
    }
    image.alt = `${driver.name} photo`;
    
    // Set categories
    const categoriesContainer = card.querySelector('.driver-categories');
    categoriesContainer.innerHTML = '';
    driver.categories.forEach(category => {
        const badge = document.createElement('span');
        badge.className = 'category-badge';
        badge.textContent = category;
        categoriesContainer.appendChild(badge);
    });
    
    // Set driver info
    card.querySelector('.driver-name').textContent = driver.name;
    card.querySelector('.driver-value').textContent = `£${formatCurrency(driver.value)}`;
    card.querySelector('.driver-description').textContent = driver.description || 'No description available';
    
    // Set up buttons
    const selectBtn = card.querySelector('.select-driver-btn');
    const removeBtn = card.querySelector('.remove-driver-btn');
    
    selectBtn.addEventListener('click', () => selectDriver(driver));
    removeBtn.addEventListener('click', () => removeDriver(driver._id));
    
    // Check if driver is already selected
    if (selectedDrivers.find(d => d._id === driver._id)) {
        cardElement.classList.add('selected');
        selectBtn.style.display = 'none';
        removeBtn.style.display = 'inline-flex';
    }
    
    return card;
}

function selectDriver(driver) {
    const totalCost = selectedDrivers.reduce((sum, d) => sum + d.value, 0) + driver.value;
    
    if (totalCost > currentUser.budget) {
        showAlert('Not enough budget to select this driver', 'error');
        return;
    }
    
    selectedDrivers.push(driver);
    updateDisplays();
    renderDrivers();
    renderSelectedDrivers();
}

function removeDriver(driverId) {
    selectedDrivers = selectedDrivers.filter(d => d._id !== driverId);
    updateDisplays();
    renderDrivers();
    renderSelectedDrivers();
}

function renderSelectedDrivers() {
    const section = document.getElementById('selected-drivers-section');
    const grid = document.getElementById('selected-drivers-grid');
    
    if (selectedDrivers.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    grid.innerHTML = '';
    
    selectedDrivers.forEach(driver => {
        const card = createSelectedDriverCard(driver);
        grid.appendChild(card);
    });
}

function createSelectedDriverCard(driver) {
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
            <p class="driver-value">£${formatCurrency(driver.value)}</p>
        </div>
        <div class="driver-actions">
            <button class="btn btn-danger btn-sm" onclick="removeDriver('${driver._id}')">
                Remove
            </button>
        </div>
    `;
    return card;
}

function updateDisplays() {
    const selectedCount = selectedDrivers.length;
    const teamValue = selectedDrivers.reduce((sum, d) => sum + d.value, 0);
    const budgetRemaining = currentUser.budget - teamValue;
    
    // Update counters
    document.getElementById('selected-count').textContent = selectedCount;
    document.getElementById('budget-used').textContent = formatCurrency(teamValue);
    document.getElementById('budget-remaining').textContent = formatCurrency(budgetRemaining);
    document.getElementById('team-value').textContent = formatCurrency(teamValue);
    
    // Update team status
    const statusElement = document.getElementById('team-status');
    if (selectedCount === 0) {
        statusElement.textContent = 'No Drivers';
        statusElement.style.color = 'var(--text-muted)';
    } else if (budgetRemaining < 0) {
        statusElement.textContent = 'Over Budget';
        statusElement.style.color = 'var(--error-color)';
    } else {
        statusElement.textContent = 'In Progress';
        statusElement.style.color = 'var(--warning-color)';
    }
    
    // Update save button
    const saveBtn = document.getElementById('save-team-btn');
    saveBtn.disabled = selectedCount === 0 || budgetRemaining < 0;
}

function updateBudgetDisplay() {
    const budgetElements = document.querySelectorAll('#budget-display');
    budgetElements.forEach(element => {
        element.textContent = formatCurrency(currentUser.budget);
    });
}

function filterDrivers(category) {
    currentFilter = category;
    
    if (category === 'all') {
        filteredDrivers = [...allDrivers];
    } else {
        filteredDrivers = allDrivers.filter(driver => driver.categories.includes(category));
    }
    
    // Apply search if active
    const searchTerm = document.getElementById('search-drivers').value.toLowerCase();
    if (searchTerm) {
        filteredDrivers = filteredDrivers.filter(driver => 
            driver.name.toLowerCase().includes(searchTerm)
        );
    }
    
    renderDrivers();
    
    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-category="${category}"]`).classList.add('active');
}

function searchDrivers() {
    const searchTerm = document.getElementById('search-drivers').value.toLowerCase();
    
    if (currentFilter === 'all') {
        filteredDrivers = allDrivers.filter(driver => 
            driver.name.toLowerCase().includes(searchTerm)
        );
    } else {
        filteredDrivers = allDrivers.filter(driver => 
            driver.categories.includes(currentFilter) &&
            driver.name.toLowerCase().includes(searchTerm)
        );
    }
    
    renderDrivers();
}

function sortDriversByValue() {
    const isAscending = filteredDrivers[0]?.value <= filteredDrivers[filteredDrivers.length - 1]?.value;
    
    if (isAscending) {
        filteredDrivers.sort((a, b) => b.value - a.value); // Descending
        document.getElementById('sort-by-value').textContent = 'Sort: High to Low';
    } else {
        filteredDrivers.sort((a, b) => a.value - b.value); // Ascending
        document.getElementById('sort-by-value').textContent = 'Sort: Low to High';
    }
    
    renderDrivers();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function showAlert(message, type = 'info') {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // Insert at top of container
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(alert, container.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
}

async function saveTeam() {
    if (selectedDrivers.length === 0) {
        showAlert('Please select at least one driver', 'error');
        return;
    }
    
    const totalCost = selectedDrivers.reduce((sum, d) => sum + d.value, 0);
    if (totalCost > currentUser.budget) {
        showAlert('Team exceeds budget', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('save-team-btn');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        // TODO: Implement actual save functionality
        // This would typically POST to /api/roster or similar
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showAlert('Team saved successfully!', 'success');
        
        // Could redirect to dashboard or show confirmation
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 2000);
        
    } catch (error) {
        console.error('Error saving team:', error);
        showAlert('Failed to save team', 'error');
    } finally {
        saveBtn.textContent = 'Save Team';
        saveBtn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('Select drivers page loaded, checking authentication...');
    checkAuthentication();
    
    // Add logout functionality
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Add save team functionality
    const saveTeamBtn = document.getElementById('save-team-btn');
    if (saveTeamBtn) {
        saveTeamBtn.addEventListener('click', saveTeam);
    }
    
    // Add filter functionality
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const category = e.target.getAttribute('data-category');
            filterDrivers(category);
        });
    });
    
    // Add search functionality
    const searchInput = document.getElementById('search-drivers');
    if (searchInput) {
        searchInput.addEventListener('input', searchDrivers);
    }
    
    // Add sort functionality
    const sortBtn = document.getElementById('sort-by-value');
    if (sortBtn) {
        sortBtn.addEventListener('click', sortDriversByValue);
    }
    
    // Initialize displays
    updateDisplays();
});