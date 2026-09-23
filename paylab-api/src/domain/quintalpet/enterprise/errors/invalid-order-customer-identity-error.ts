export class InvalidOrderCustomerIdentityError extends Error {
	constructor() {
		super(
			'An order must have exactly one of a registered store customer or a guest name and phone.',
		)
	}
}
