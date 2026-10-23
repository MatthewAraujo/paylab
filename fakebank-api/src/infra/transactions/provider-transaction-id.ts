import { randomBytes } from 'node:crypto'

const PROVIDER_TRANSACTION_ID_PREFIX = 'FBK-'

/** FakeBank's own identifier: `FBK-` + a UUID v7 (time-ordered, so ids sort by creation). */
export function newProviderTransactionId(now: number = Date.now()): string {
	return `${PROVIDER_TRANSACTION_ID_PREFIX}${uuidV7(now)}`
}

// RFC 9562 UUID v7: 48-bit Unix milliseconds, version 7, variant 10, 74 random bits.
// Node 22 has no built-in v7, and one function does not justify a dependency.
function uuidV7(now: number): string {
	const bytes = randomBytes(16)
	bytes.writeUIntBE(now, 0, 6)
	bytes[6] = (bytes[6] & 0x0f) | 0x70
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = bytes.toString('hex')

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
