export class InvalidShippingSettingsError extends Error {
	constructor(reason: string) {
		super(`Invalid shipping settings: ${reason}`)
	}
}
