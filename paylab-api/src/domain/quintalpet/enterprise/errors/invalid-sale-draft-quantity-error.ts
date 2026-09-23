export class InvalidSaleDraftQuantityError extends Error {
	constructor() {
		super('Cannot reduce a sale draft line below zero.')
	}
}
