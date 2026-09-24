import { assertDemoDatabaseUrl } from '../../scripts/demo/guard'

const url = (name: string, host = 'localhost') =>
	`postgresql://paylab:paylab@${host}:5432/${name}?schema=public`

describe('assertDemoDatabaseUrl', () => {
	test.each(['paylab_demo', 'demo', 'paylab_demo_2'])(
		'accepts a local database named %s',
		(name) => {
			expect(assertDemoDatabaseUrl(url(name)).name).toBe(name)
		},
	)

	test.each(['localhost', '127.0.0.1', '[::1]'])('accepts the local host %s', (host) => {
		expect(() => assertDemoDatabaseUrl(url('paylab_demo', host))).not.toThrow()
	})

	test.each(['paylab', 'paylab_test', 'paylab_bench', 'postgres'])(
		'refuses %s: the name must contain "demo"',
		(name) => {
			expect(() => assertDemoDatabaseUrl(url(name))).toThrow(/must contain "demo"/)
		},
	)

	test('refuses a remote host, so the seed can never reach a shared database', () => {
		expect(() => assertDemoDatabaseUrl(url('paylab_demo', 'db.example.com'))).toThrow(/local/)
	})

	test('refuses a name that is not a plain identifier', () => {
		expect(() => assertDemoDatabaseUrl(url('demo"; DROP DATABASE paylab; --'))).toThrow(
			/plain identifier/,
		)
	})

	test('refuses a missing or malformed URL with a clear message', () => {
		expect(() => assertDemoDatabaseUrl(undefined)).toThrow(/DEMO_DATABASE_URL/)
		expect(() => assertDemoDatabaseUrl('not a url')).toThrow(/DEMO_DATABASE_URL/)
	})
})
