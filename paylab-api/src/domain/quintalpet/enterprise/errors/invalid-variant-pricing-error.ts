export class InvalidVariantPricingError extends Error {
	constructor() {
		super('Variant pricing is invalid.')
	}
}
