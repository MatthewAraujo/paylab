export class InactiveCategoryAssignmentError extends Error {
	constructor() {
		super('Inactive or archived categories cannot be assigned to products.')
	}
}
