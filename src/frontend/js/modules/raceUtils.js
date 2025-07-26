export async function loadRaceInformation({ apiModules, currentYear }) {
	try {
		const nextRaceResult = await apiModules.races.getNextSubmissionRace(currentYear);

		if (nextRaceResult.success && nextRaceResult.data.next) {
			return {
				currentRace: nextRaceResult.data.next,
				status: "success",
			};
		}

		const currentRaceResult = await apiModules.races.getCurrentRace(currentYear);

		if (currentRaceResult.success && currentRaceResult.data.current) {
			return {
				currentRace: currentRaceResult.data.current,
				status: "success",
			};
		}

		return {
			currentRace: null,
			raceStatus: {
				status: "no-race",
				message: "No races available for submissions",
				canSubmit: false,
			},
		};
	} catch (error) {
		console.error("Error loading race information:", error);
		return {
			currentRace: null,
			raceStatus: {
				status: "error",
				message: "Error loading race information",
				canSubmit: false,
			},
			error,
		};
	}
}
