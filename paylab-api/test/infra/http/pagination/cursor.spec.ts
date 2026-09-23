import { decodeCursor, encodeCursor } from '@/infra/http/pagination/cursor'

const position = {
	createdAt: new Date('2026-09-23T12:34:56.789Z'),
	id: '0b1f7e0e-6a44-4f0a-9d8b-2f2f8f5f7a10',
}

function raw(text: string) {
	return Buffer.from(text).toString('base64url')
}

describe('keyset cursor', () => {
	test('round-trips a position exactly, including milliseconds', () => {
		expect(decodeCursor(encodeCursor(position))).toEqual(position)
	})

	test('is opaque and URL-safe', () => {
		const cursor = encodeCursor(position)

		expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
		expect(cursor).not.toContain(position.id)
	})

	test.each([
		['empty', ''],
		['not base64 json', 'not-a-cursor!'],
		['wrong shape', raw('{"a":1}')],
		['missing checksum', raw(`2026-09-23T12:34:56.789Z|${position.id}`)],
		['invalid id', raw('2026-09-23T12:34:56.789Z|x|00000000')],
		['invalid time', raw(`nope|${position.id}|00000000`)],
	])('rejects a malformed cursor: %s', (_name, cursor) => {
		expect(decodeCursor(cursor)).toBeNull()
	})

	test('rejects a tampered cursor: any edit of the position breaks the checksum', () => {
		const payload = Buffer.from(encodeCursor(position), 'base64url').toString()
		const [time, id, checksum] = payload.split('|')
		const otherId = id.replace(/.$/, id.endsWith('0') ? '1' : '0')
		const otherTime = time.replace('56.789', '56.790')

		expect(decodeCursor(raw(`${time}|${otherId}|${checksum}`))).toBeNull()
		expect(decodeCursor(raw(`${otherTime}|${id}|${checksum}`))).toBeNull()
	})

	test('rejects a non-canonical encoding of a valid cursor', () => {
		expect(decodeCursor(`${encodeCursor(position)}=`)).toBeNull()
		expect(decodeCursor(`${encodeCursor(position)}AA`)).toBeNull()
	})
})
