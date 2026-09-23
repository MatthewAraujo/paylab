export class InvalidMerchandisingReferenceError extends Error {
	constructor(entityType: 'category' | 'product') {
		super(`Featured ${entityType} references must belong to the current store.`)
	}
}
