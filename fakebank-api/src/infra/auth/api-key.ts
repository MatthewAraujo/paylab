import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Plain SHA-256: Client keys are high-entropy random secrets, so a slow password hash would
 * add latency to every request without adding protection.
 */
export function hashApiKey(rawKey: string): string {
	return createHash('sha256').update(rawKey).digest('hex')
}

/** Constant-time comparison of two hex digests (AC-34); different lengths never match. */
export function hashesMatch(a: string, b: string): boolean {
	const left = Buffer.from(a, 'hex')
	const right = Buffer.from(b, 'hex')

	return left.length === right.length && timingSafeEqual(left, right)
}
