import { decodeRunCursor, encodeRunCursor } from '@/infra/http/pagination/run-cursor'

const position = { startedAt: '2026-09-23T10:00:00.000Z', runId: '2026-09-23T10-00-00Z-abc1234' }

describe('run cursor', () => {
	it('round-trips a position', () => {
		expect(decodeRunCursor(encodeRunCursor(position))).toEqual(position)
	})

	it('is opaque and URL safe', () => {
		expect(encodeRunCursor(position)).toMatch(/^[A-Za-z0-9_-]+$/)
	})

	it('rejects anything it did not produce', () => {
		const good = encodeRunCursor(position)
		const tampered = Buffer.from(
			Buffer.from(good, 'base64url').toString().replace('abc1234', 'zzz9999'),
		).toString('base64url')

		for (const bad of [
			'',
			'not a cursor',
			`${good}x`,
			tampered,
			Buffer.from('a|b|c').toString('base64url'),
		]) {
			expect(decodeRunCursor(bad), bad).toBeNull()
		}
	})

	it('rejects a run id that could name a path', () => {
		const forged = Buffer.from('2026-09-23T10:00:00.000Z|../etc|00000000').toString('base64url')

		expect(decodeRunCursor(forged)).toBeNull()
	})
})
