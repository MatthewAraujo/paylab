export class CategoryCycleError extends Error {
	constructor() {
		super('Category parenting cannot create cycles.')
	}
}
