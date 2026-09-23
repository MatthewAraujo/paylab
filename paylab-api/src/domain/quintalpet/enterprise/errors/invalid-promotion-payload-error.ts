export class InvalidPromotionPayloadError extends Error {
	constructor(reason: string) {
		super(`Invalid promotion payload: ${reason}`)
	}
}
