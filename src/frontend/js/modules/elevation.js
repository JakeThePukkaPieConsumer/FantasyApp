class ElevationModule {
    constructor(apiModule, modalModule, notificationModule) {
        this.apiModule = apiModule;
        this.modalModule = modalModule;
        this.notificationModule = notificationModule;
        this.elevatedToken = null;
        this.elevationExpiry = null;
        this.elevationDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
    }

    init() {
        this.setupEventListeners();
        this.updateElevationStatus();
        
        setInterval(() => {
            this.checkElevationExpiry();
        }, 60000); // Check every minute
    }

    setupEventListeners() {
        const elevateBtn = document.getElementById('elevate-btn');
        if (elevateBtn) {
            elevateBtn.addEventListener('click', () => {
                if (this.isElevated()) {
                    this.revokeElevation();
                } else {
                    this.modalModule.open('elevation-modal');
                }
            });
        }

        const elevationForm = document.getElementById('elevation-form');
        if (elevationForm) {
            elevationForm.addEventListener('submit', (e) => this.handleElevationRequest(e));
        }
    }

    async handleElevationRequest(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const elevationKey = formData.get('elevationKey');

        if (!elevationKey || elevationKey.trim() === '') {
            this.notificationModule.error('Please enter the elevation key');
            return;
        }

        try {
            const result = await this.apiModule.users.requestElevation(elevationKey);
            console.log('Elevation result:', result);

            if (!result.success) {
                throw new Error(result.error);
            }

            this.elevatedToken = result.elevatedToken;
            console.log(result.data.token);
            console.log(result.elevatedToken);
            this.elevationExpiry = Date.now() + this.elevationDuration;
            
            this.notificationModule.success('Elevation granted successfully');
            this.modalModule.close('elevation-modal');
            this.updateElevationStatus();
            this.showElevatedActions();
        } catch (error) {
            console.error('Elevation request failed:', error);
            this.notificationModule.error(error.message || 'Elevation request failed');
        }
    }

    isElevated() {
        return this.elevatedToken && this.elevationExpiry && Date.now() < this.elevationExpiry;
    }

    getElevatedToken() {
        if (!this.isElevated()) {
            return null;
        }
        return this.elevatedToken;
    }

    requireElevation() {
        if (!this.isElevated()) {
            this.notificationModule.warning('Administrative elevation required for this action');
            this.modalModule.open('elevation-modal');
            return false;
        }
        return true;
    }

    revokeElevation() {
        this.elevatedToken = null;
        this.elevationExpiry = null;
        this.updateElevationStatus();
        this.hideElevatedActions();
        this.notificationModule.info('Elevation revoked');
    }

    checkElevationExpiry() {
        if (this.elevationExpiry && Date.now() >= this.elevationExpiry) {
            this.revokeElevation();
            this.notificationModule.warning('Administrative elevation has expired');
        }
    }

    updateElevationStatus() {
        const statusElement = document.getElementById('elevation-status');
        const elevateBtn = document.getElementById('elevate-btn');

        if (!statusElement || !elevateBtn) return;

        if (this.isElevated()) {
            const timeRemaining = Math.ceil((this.elevationExpiry - Date.now()) / 60000);
            statusElement.textContent = `Elevated (${timeRemaining}m remaining)`;
            statusElement.className = 'text-sm font-semibold text-success-color';
            elevateBtn.textContent = 'Revoke Elevation';
            elevateBtn.className = 'btn btn-warning';
        } else {
            statusElement.textContent = 'Not Elevated';
            statusElement.className = 'text-sm font-semibold text-error-color';
            elevateBtn.textContent = 'Request Elevation';
            elevateBtn.className = 'btn btn-primary';
        }
    }

    showElevatedActions() {
        const elevatedActions = document.getElementById('elevated-actions');
        if (elevatedActions) {
            elevatedActions.style.display = 'block';
        }
    }

    hideElevatedActions() {
        const elevatedActions = document.getElementById('elevated-actions');
        if (elevatedActions) {
            elevatedActions.style.display = 'none';
        }
    }

    getRemainingTime() {
        if (!this.isElevated()) {
            return 0;
        }
        return Math.max(0, this.elevationExpiry - Date.now());
    }

    getRemainingTimeFormatted() {
        const remaining = this.getRemainingTime();
        if (remaining === 0) {
            return 'Expired';
        }
        
        const minutes = Math.ceil(remaining / 60000);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
    }

    extendElevation() {
        if (this.isElevated()) {
            this.elevationExpiry = Date.now() + this.elevationDuration;
            this.updateElevationStatus();
            this.notificationModule.success('Elevation extended');
        }
    }

    setElevationDuration(minutes) {
        this.elevationDuration = minutes * 60 * 1000;
    }
}

export default ElevationModule;