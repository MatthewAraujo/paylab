export class InvalidPromotionTransitionError extends Error {
	constructor(from: string, to: string) {
		super(`Invalid promotion status transition: ${from} -> ${to}`)
	}
}
