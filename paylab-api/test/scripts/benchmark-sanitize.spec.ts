import { createSanitizer } from '../../scripts/benchmark/sanitize'

describe('createSanitizer', () => {
	const sanitize = createSanitizer({ secrets: ['hunter2-private-value'] })

	it('redacts a database URL together with its credentials', () => {
		const line =
			'connecting to postgresql://paylab:s3cret@localhost:5433/paylab_bench?schema=public now'

		expect(sanitize(line)).toBe('connecting to [REDACTED_DATABASE_URL] now')
	})

	it('redacts other URLs that carry credentials', () => {
		expect(sanitize('fetch https://user:pw@example.com/path')).toBe('fetch [REDACTED_URL]/path')
	})

	it('redacts a configured secret wherever it appears', () => {
		expect(sanitize('token is hunter2-private-value, really hunter2-private-value')).toBe(
			'token is [REDACTED], really [REDACTED]',
		)
	})

	it('redacts values assigned to sensitive names', () => {
		expect(sanitize('DB_PASSWORD=abc123 and API_KEY: k-999')).toBe(
			'DB_PASSWORD=[REDACTED] and API_KEY: [REDACTED]',
		)
		expect(sanitize('{"secret": "shh", "name": "ok"}')).toBe(
			'{"secret": "[REDACTED]", "name": "ok"}',
		)
	})

	it('redacts bearer tokens', () => {
		expect(sanitize('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer [REDACTED]')
	})

	it('leaves ordinary output untouched', () => {
		const line = 'scenario t14.settle.hot: 1234.5 tx/s p99=12ms, 3 repetitions'

		expect(sanitize(line)).toBe(line)
	})

	it('ignores empty configured secrets instead of erasing everything', () => {
		expect(createSanitizer({ secrets: ['', '  '] })('plain text')).toBe('plain text')
	})
})
