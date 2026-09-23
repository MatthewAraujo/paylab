import { createHash } from 'node:crypto'
import { z } from 'zod'

/** The keyset position of the last row of a page: creation time, then id. */
export interface CursorPosition {
	createdAt: Date
	id: string
}

const idSchema = z.string().uuid()

// A short checksum catches truncated, corrupted or hand-edited cursors. It is not a
// security control: a forged cursor can only move inside the caller's own scope,
// because every query is filtered by Merchant (and Account) before the keyset.
function checksum(payload: string) {
	return createHash('sha256').update(payload).digest('hex').slice(0, 8)
}

/** Opaque, URL-safe cursor: base64url of `<iso time>|<id>|<checksum>`. */
export function encodeCursor({ createdAt, id }: CursorPosition): string {
	const payload = `${createdAt.toISOString()}|${id}`

	return Buffer.from(`${payload}|${checksum(payload)}`).toString('base64url')
}

/** Returns null for anything that is not exactly a cursor produced by `encodeCursor`. */
export function decodeCursor(cursor: string): CursorPosition | null {
	if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
		return null
	}

	const decoded = Buffer.from(cursor, 'base64url')

	// Rejects non-canonical encodings (extra characters that decode to the same bytes).
	if (decoded.toString('base64url') !== cursor) {
		return null
	}

	const parts = decoded.toString('utf8').split('|')

	if (parts.length !== 3) {
		return null
	}

	const [time, id, sum] = parts
	const createdAt = new Date(time)

	if (
		Number.isNaN(createdAt.getTime()) ||
		createdAt.toISOString() !== time ||
		!idSchema.safeParse(id).success ||
		sum !== checksum(`${time}|${id}`)
	) {
		return null
	}

	return { createdAt, id }
}
