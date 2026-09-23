export class InvalidDeliveryOptionError extends Error {
	constructor() {
		super('Unknown delivery option.')
	}
}
