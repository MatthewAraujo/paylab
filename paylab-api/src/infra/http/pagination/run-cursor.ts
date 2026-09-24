import { createHash } from 'node:crypto'
import { safeId } from '@/domain/benchmark/summary'

/** The keyset position of the last Run of a page: start time, then run id (both descending). */
export interface RunCursorPosition {
	startedAt: string
	runId: string
}

// A checksum catches truncated or hand-edited cursors; it is not a security control, since the
// list is public inside this local surface anyway.
const checksum = (payload: string) => createHash('sha256').update(payload).digest('hex').slice(0, 8)

export function encodeRunCursor({ startedAt, runId }: RunCursorPosition): string {
	const payload = `${startedAt}|${runId}`
	return Buffer.from(`${payload}|${checksum(payload)}`).toString('base64url')
}

/** Returns null for anything that is not exactly a cursor produced by `encodeRunCursor`. */
export function decodeRunCursor(cursor: string): RunCursorPosition | null {
	if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
		return null
	}
	const decoded = Buffer.from(cursor, 'base64url')
	if (decoded.toString('base64url') !== cursor) {
		return null
	}
	const parts = decoded.toString('utf8').split('|')
	if (parts.length !== 3) {
		return null
	}
	const [startedAt, runId, sum] = parts
	const time = new Date(startedAt)
	if (
		Number.isNaN(time.getTime()) ||
		time.toISOString() !== startedAt ||
		!safeId.safeParse(runId).success ||
		sum !== checksum(`${startedAt}|${runId}`)
	) {
		return null
	}
	return { startedAt, runId }
}
