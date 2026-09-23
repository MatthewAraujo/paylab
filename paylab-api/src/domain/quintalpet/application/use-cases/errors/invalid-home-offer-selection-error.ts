export class InvalidHomeOfferSelectionError extends Error {
	constructor(reason: string) {
		super(`Invalid curated home offer selection: ${reason}`)
	}
}
