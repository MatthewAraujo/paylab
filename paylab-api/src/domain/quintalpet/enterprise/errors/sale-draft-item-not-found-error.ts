export class SaleDraftItemNotFoundError extends Error {
	constructor(public readonly variantId: string) {
		super(`No line for variant ${variantId} exists in this sale draft.`)
	}
}
