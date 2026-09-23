export class MerchandisingLimitExceededError extends Error {
	constructor(
		readonly entityType: 'category' | 'product',
		readonly limit: number,
	) {
		super(`Featured ${entityType} references cannot exceed ${limit} items.`)
	}
}
