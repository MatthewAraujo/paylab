export class StalePdvSessionRequiresConfirmationError extends Error {
	constructor() {
		super(
			'An open PDV session from a previous day exists. Confirm replacing it to open a new session.',
		)
	}
}
