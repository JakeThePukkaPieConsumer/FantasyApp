export async function loadRaceInformation({ apiModules, currentYear }) {
	try {
		console.log("Loading race information for year:", currentYear);

		const nextRaceResult = await apiModules.races.getNextSubmissionRace(
			currentYear
		);

		if (nextRaceResult.success && nextRaceResult.data.next) {
			console.log(
				"Found next submission race:",
				nextRaceResult.data.next.name
			);
			return {
				currentRace: nextRaceResult.data.next,
				status: "success",
				source: "next-submission",
			};
		}

		console.log("No next submission race found, checking current race...");

		const currentRaceResult = await apiModules.races.getCurrentRace(
			currentYear
		);

		if (currentRaceResult.success && currentRaceResult.data.current) {
			console.log(
				"Found current race:",
				currentRaceResult.data.current.name
			);
			return {
				currentRace: currentRaceResult.data.current,
				status: "success",
				source: "current",
			};
		}

		console.log(
			"No current race found, trying to get any available races..."
		);

		const allRacesResult = await apiModules.races.getRaces(currentYear, {
			sort: "submissionDeadline",
			order: "asc",
		});

		if (
			allRacesResult.success &&
			allRacesResult.data.races &&
			allRacesResult.data.races.length > 0
		) {
			const now = new Date();
			const upcomingRace = allRacesResult.data.races.find((race) => {
				const deadline = new Date(race.submissionDeadline);
				return deadline > now && !race.isLocked;
			});

			if (upcomingRace) {
				console.log(
					"Found upcoming race with valid deadline:",
					upcomingRace.name
				);
				return {
					currentRace: upcomingRace,
					status: "success",
					source: "upcoming",
				};
			}

			const mostRecentRace =
				allRacesResult.data.races[allRacesResult.data.races.length - 1];
			console.log(
				"Using most recent race:",
				mostRecentRace?.name || "Unknown"
			);

			return {
				currentRace: mostRecentRace,
				status: "success",
				source: "recent",
				warning:
					"Using most recent race - submission may not be available",
			};
		}

		console.log("No races found at all for year:", currentYear);

		return {
			currentRace: null,
			raceStatus: {
				status: "no-race",
				message: "No races available for submissions",
				canSubmit: false,
			},
			status: "no-races",
			source: "none",
		};
	} catch (error) {
		console.error("Error loading race information:", error);

		return {
			currentRace: null,
			raceStatus: {
				status: "error",
				message: "Error loading race information: " + error.message,
				canSubmit: false,
			},
			status: "error",
			error: error,
			source: "error",
		};
	}
}

export async function checkRaceSubmissionEligibility({
	apiModules,
	currentYear,
	raceId,
}) {
	if (!raceId) {
		return {
			eligible: false,
			status: "no-race",
			message: "No race ID provided",
			canSubmit: false,
		};
	}

	try {
		const eligibilityResult =
			await apiModules.races.checkSubmissionEligibility(
				currentYear,
				raceId
			);

		if (!eligibilityResult.success) {
			throw new Error(
				eligibilityResult.error || "Failed to check eligibility"
			);
		}

		const data = eligibilityResult.data;

		if (data.locked) {
			return {
				eligible: false,
				status: "locked",
				message: "Race is locked by administrators",
				canSubmit: false,
				timeRemaining: 0,
			};
		}

		if (data.deadlinePassed) {
			return {
				eligible: false,
				status: "expired",
				message: "Submission deadline has passed",
				canSubmit: false,
				timeRemaining: 0,
			};
		}

		return {
			eligible: data.eligible,
			status: data.deadlineSoon ? "urgent" : "open",
			message: data.deadlineSoon
				? `Deadline approaching! ${data.hoursRemaining}h remaining`
				: `${data.hoursRemaining}h until deadline`,
			canSubmit: data.eligible,
			timeRemaining: data.timeRemaining,
			hoursRemaining: data.hoursRemaining,
			deadlineSoon: data.deadlineSoon,
		};
	} catch (error) {
		console.error("Error checking race eligibility:", error);
		return {
			eligible: false,
			status: "error",
			message: "Error checking race status: " + error.message,
			canSubmit: false,
		};
	}
}

export function formatRaceDeadline(deadline) {
	if (!deadline) return "TBA";

	try {
		const date = new Date(deadline);
		return date.toLocaleString("en-GB", {
			timeZone: "UTC",
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch (error) {
		console.error("Error formatting deadline:", error);
		return "Invalid Date";
	}
}

export function calculateTimeRemaining(deadline) {
	if (!deadline) return { hours: 0, minutes: 0, expired: true };

	try {
		const now = new Date();
		const deadlineDate = new Date(deadline);
		const diff = deadlineDate - now;

		if (diff <= 0) {
			return { hours: 0, minutes: 0, expired: true };
		}

		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

		return {
			hours,
			minutes,
			expired: false,
			totalMinutes: Math.floor(diff / (1000 * 60)),
			isUrgent: hours < 24,
		};
	} catch (error) {
		console.error("Error calculating time remaining:", error);
		return { hours: 0, minutes: 0, expired: true };
	}
}

export function validateRaceForSubmission(race) {
	if (!race) {
		return {
			valid: false,
			errors: ["No race provided"],
		};
	}

	const errors = [];

	if (!race._id) {
		errors.push("Race ID is missing");
	}

	if (!race.name) {
		errors.push("Race name is missing");
	}

	if (!race.submissionDeadline) {
		errors.push("Race submission deadline is missing");
	} else {
		const timeRemaining = calculateTimeRemaining(race.submissionDeadline);
		if (timeRemaining.expired) {
			errors.push("Race submission deadline has passed");
		}
	}

	if (race.isLocked) {
		errors.push("Race is locked for submissions");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
