class NotificationModule {
    constructor() {
        this.notifications = new Set();
        this.defaultDuration = 5000; // 5 seconds
    }

    createNotification(message, type = 'info', options = {}) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        if (options.className) {
            notification.classList.add(options.className);
        }

        if (options.persistent) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'notification-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => this.remove(notification));
            notification.appendChild(closeBtn);
        }

        return notification;
    }

    show(message, type = 'info', options = {}) {
        if (options.clearExisting) {
            this.clearByType(type);
        }

        if (options.clearAll) {
            this.clearAll();
        }

        const notification = this.createNotification(message, type, options);
        this.notifications.add(notification);

        document.body.appendChild(notification);

        if (!options.persistent) {
            const duration = options.duration || this.defaultDuration;
            setTimeout(() => {
                this.remove(notification);
            }, duration);
        }

        return notification;
    }

    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    remove(notification) {
        if (notification && notification.parentNode) {
            // Fade out animation
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                    this.notifications.delete(notification);
                }
            }, 300);
        }
    }

    clearByType(type) {
        const notifications = document.querySelectorAll(`.notification-${type}`);
        notifications.forEach(notification => {
            this.remove(notification);
        });
    }

    clearAll() {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(notification => {
            this.remove(notification);
        });
        this.notifications.clear();
    }

    showLoading(message = 'Loading...', options = {}) {
        const loadingOptions = {
            ...options,
            persistent: true,
            className: 'notification-loading'
        };

        const notification = this.show(message, 'info', loadingOptions);
        
        const spinner = document.createElement('div');
        spinner.className = 'notification-spinner';
        notification.appendChild(spinner);

        return notification;
    }

    hideLoading() {
        const loadingNotifications = document.querySelectorAll('.notification-loading');
        loadingNotifications.forEach(notification => {
            this.remove(notification);
        });
    }

    showValidationErrors(errors, options = {}) {
        if (Array.isArray(errors)) {
            errors.forEach(error => {
                this.error(error, { ...options, duration: 7000 });
            });
        } else {
            this.error(errors, { ...options, duration: 7000 });
        }
    }

    showApiError(error, options = {}) {
        const message = error?.message || error || 'An unexpected error occurred';
        return this.error(message, options);
    }

    showNetworkError(options = {}) {
        return this.error('Network error. Please check your connection and try again.', options);
    }

    showUnauthorizedError(options = {}) {
        return this.error('You are not authorized to perform this action.', options);
    }

    setDefaultDuration(duration) {
        this.defaultDuration = duration;
    }

    getCount() {
        return this.notifications.size;
    }

    hasNotifications() {
        return this.notifications.size > 0;
    }
}

const notificationModule = new NotificationModule();

window.showSuccess = (message, options) => notificationModule.success(message, options);
window.showError = (message, options) => notificationModule.error(message, options);
window.showInfo = (message, options) => notificationModule.info(message, options);
window.showWarning = (message, options) => notificationModule.warning(message, options);

export default notificationModule;