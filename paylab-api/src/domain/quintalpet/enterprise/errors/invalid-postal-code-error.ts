export class InvalidPostalCodeError extends Error {
	constructor() {
		super('The postal code is invalid or could not be found.')
	}
}
