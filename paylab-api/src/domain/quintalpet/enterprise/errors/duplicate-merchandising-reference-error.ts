export class DuplicateMerchandisingReferenceError extends Error {
	constructor(entityType: 'category' | 'product') {
		super(`Featured ${entityType} references must be unique.`)
	}
}
