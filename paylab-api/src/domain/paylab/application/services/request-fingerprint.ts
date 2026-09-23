import { createHash } from 'node:crypto'

export interface PaymentRequestShape {
	sourceAccountId: string
	destinationAccountId: string
	amount: number
	currency: string
}

/**
 * Fingerprint of the normalized Payment request body. It is stored with the
 * Payment so a replay of the same Idempotency Key can tell "same request"
 * (return the original Payment) from "different request" (reject).
 */
export function requestFingerprint(request: PaymentRequestShape): string {
	const normalized = JSON.stringify([
		request.sourceAccountId.toLowerCase(),
		request.destinationAccountId.toLowerCase(),
		request.amount,
		request.currency.toUpperCase(),
	])

	return createHash('sha256').update(normalized).digest('hex')
}
