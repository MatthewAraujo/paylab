export class VariantBarcodeAlreadySetError extends Error {
	constructor(public readonly variantId: string) {
		super(`Product variant ${variantId} already has a different barcode assigned.`)
	}
}
