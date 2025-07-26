class DriverRosterManager {
	constructor(apiModules, currentYear, notificationModule) {
		this.apiModules = apiModules;
		this.currentYear = currentYear;
		this.notificationModule = notificationModule;
	}

	async saveRoster(rosterData, existingRoster = null) {
		try {
			const loadingNotification = this.notificationModule.showLoading(
				"Saving your team..."
			);

			let result;
			if (existingRoster) {
				result = await this.apiModules.rosters.updateRoster(
					this.currentYear,
					existingRoster._id,
					rosterData
				);
			} else {
				result = await this.apiModules.rosters.createRoster(
					this.currentYear,
					rosterData
				);
			}

			this.notificationModule.remove(loadingNotification);

			if (!result.success) {
				throw new Error(result.error || "Failed to save roster");
			}

			const actionText = existingRoster ? "updated" : "saved";
			return {
				success: true,
				roster: result.data.roster,
				actionText,
				message: `Team ${actionText} successfully!`,
			};
		} catch (error) {
			console.error("Error saving roster:", error);
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async loadExistingRoster(userId, raceId) {
		if (!raceId || !userId) {
			return { success: false, roster: null };
		}

		try {
			const result = await this.apiModules.rosters.getRosters(
				this.currentYear,
				{
					user: userId,
					race: raceId,
				}
			);

			if (
				result.success &&
				result.data.rosters &&
				result.data.rosters.length > 0
			) {
				return {
					success: true,
					roster: result.data.rosters[0],
				};
			}

			return { success: true, roster: null };
		} catch (error) {
			console.error("Error loading existing roster:", error);
			return { success: false, error: error.message };
		}
	}

	async getUserRosterHistory(userId) {
		if (!userId) return [];

		try {
			const result = await this.apiModules.rosters.getUserRosters(
				this.currentYear,
				userId
			);

			return result.success ? result.data.rosters || [] : [];
		} catch (error) {
			console.error("Error loading roster history:", error);
			return [];
		}
	}

	async validateRoster(rosterData) {
		try {
			const result = await this.apiModules.rosters.validateRoster(
				this.currentYear,
				rosterData
			);

			return {
				success: result.success,
				valid: result.success ? result.data.valid : false,
				errors: result.success
					? result.data.errors || []
					: [result.error],
			};
		} catch (error) {
			console.error("Error validating roster:", error);
			return {
				success: false,
				valid: false,
				errors: [error.message],
			};
		}
	}

	buildRosterData(userId, selectedDrivers, teamValue, raceId) {
		return {
			user: userId,
			drivers: selectedDrivers.map((driver) => driver._id),
			budgetUsed: teamValue,
			pointsEarned: 0,
			race: raceId,
		};
	}

	mapRosterDrivers(rosterDrivers, availableDrivers) {
		const mappedDrivers = [];

		for (const driverRef of rosterDrivers) {
			const driver = availableDrivers.find(
				(d) => d._id === driverRef._id
			);
			if (driver) {
				mappedDrivers.push(driver);
			}
		}

		return mappedDrivers;
	}
}

export default DriverRosterManager;
