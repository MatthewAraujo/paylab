export class InvalidPromotionError extends Error {
	constructor(reason: string) {
		super(`Invalid promotion: ${reason}`)
	}
}
