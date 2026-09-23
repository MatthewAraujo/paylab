export class InvalidCatalogLifecycleTransitionError extends Error {
	constructor() {
		super('Invalid catalog lifecycle transition.')
	}
}
