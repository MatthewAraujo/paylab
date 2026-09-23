export class SaleDraftNotEmptyError extends Error {
	constructor() {
		super('Cannot close a PDV session while its active sale draft still has items.')
	}
}
