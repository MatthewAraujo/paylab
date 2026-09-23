export class VariantNotFoundError extends Error {
	constructor(public readonly variantId: string) {
		super(`Product variant ${variantId} not found or not active.`)
	}
}
