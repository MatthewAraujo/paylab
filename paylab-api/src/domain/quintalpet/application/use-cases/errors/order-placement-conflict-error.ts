export class OrderPlacementConflictError extends Error {
	constructor() {
		super('Could not confirm stock for this order, please try again.')
	}
}
