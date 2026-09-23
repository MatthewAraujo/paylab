export class BarcodeNotInDraftError extends Error {
	constructor(public readonly barcode: string) {
		super(`Barcode ${barcode} is not an unmatched barcode on this sale draft.`)
	}
}
