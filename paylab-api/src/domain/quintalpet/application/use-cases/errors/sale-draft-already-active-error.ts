export class SaleDraftAlreadyActiveError extends Error {
	constructor() {
		super('This PDV session already has an active sale draft.')
	}
}
