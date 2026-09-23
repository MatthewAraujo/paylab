export class EmptySaleDraftError extends Error {
	constructor() {
		super('Cannot finalize a sale draft with no items.')
	}
}
