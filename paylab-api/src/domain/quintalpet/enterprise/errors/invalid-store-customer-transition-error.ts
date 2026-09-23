export class InvalidStoreCustomerTransitionError extends Error {
	constructor() {
		super('Invalid store customer status transition.')
	}
}
