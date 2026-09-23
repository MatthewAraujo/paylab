export class InvalidPrimaryCategoryError extends Error {
	constructor() {
		super('Primary category must belong to the assigned categories.')
	}
}
