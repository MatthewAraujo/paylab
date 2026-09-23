export class InvalidOrderTransitionError extends Error {
	constructor() {
		super('Invalid order status transition.')
	}
}
