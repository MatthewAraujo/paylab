export class OrderItemUnavailableError extends Error {
	constructor(public readonly variantId: string) {
		super(`Item ${variantId} is not available in the requested quantity.`)
	}
}
