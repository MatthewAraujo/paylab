import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const API_KEY_PREFIX = 'pk_'

/** 256 random bits, base64url encoded, behind a recognizable prefix. */
export function generateApiKey(): string {
	return `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

/**
 * Plain SHA-256: the input is a high-entropy random key, so a slow password
 * hash would add latency to every request without adding protection.
 */
export function hashApiKey(rawKey: string): string {
	return createHash('sha256').update(rawKey).digest('hex')
}

/** Constant-time comparison of two hashes; different lengths never match. */
export function hashesMatch(a: string, b: string): boolean {
	const left = Buffer.from(a)
	const right = Buffer.from(b)

	return left.length === right.length && timingSafeEqual(left, right)
}
