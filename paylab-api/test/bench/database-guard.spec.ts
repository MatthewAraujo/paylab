import { assertBenchDatabaseUrl } from '../../bench/lib/database'

const url = (name: string, host = 'localhost', port = 5433) =>
	`postgresql://paylab:paylab@${host}:${port}/${name}?schema=public`

describe('assertBenchDatabaseUrl', () => {
	it('accepts a local database whose name contains "bench" and derives the template name', () => {
		const database = assertBenchDatabaseUrl(url('paylab_bench'))

		expect(database).toMatchObject({ name: 'paylab_bench', templateName: 'paylab_bench_template' })
	})

	it('accepts an explicit template, such as one that already exists', () => {
		const database = assertBenchDatabaseUrl(url('paylab_bench'), {
			templateName: 'paylab_bench_adopted',
		})

		expect(database.templateName).toBe('paylab_bench_adopted')
	})

	test.each(['paylab', 'paylab_test', 'postgres', 'paylab_demo'])(
		'refuses %s: the name must contain "bench"',
		(name) => {
			expect(() => assertBenchDatabaseUrl(url(name))).toThrow(/must contain "bench"/)
		},
	)

	it('refuses when the variable is not set or not a URL', () => {
		expect(() => assertBenchDatabaseUrl(undefined)).toThrow(/BENCH_DATABASE_URL is not set/)
		expect(() => assertBenchDatabaseUrl('not a url')).toThrow(/not a valid URL/)
	})

	it('refuses a remote host: the database is dropped and recreated on every Run', () => {
		expect(() => assertBenchDatabaseUrl(url('paylab_bench', 'db.example.com'))).toThrow(/local/)
	})

	it('refuses a name that is not a plain identifier', () => {
		expect(() => assertBenchDatabaseUrl(url('bench"; DROP DATABASE paylab; --'))).toThrow(
			/plain identifier/,
		)
	})

	it('refuses the development or test database even if it were named like a benchmark one', () => {
		const same = url('paylab_bench', 'localhost', 5432)

		expect(() => assertBenchDatabaseUrl(same, { forbiddenUrls: [same] })).toThrow(
			/development or test database/,
		)
		expect(() =>
			assertBenchDatabaseUrl(url('paylab_bench'), {
				forbiddenUrls: [url('paylab', 'localhost', 5432)],
			}),
		).not.toThrow()
	})

	it('refuses a template that is the database itself or not a plain identifier', () => {
		expect(() =>
			assertBenchDatabaseUrl(url('paylab_bench'), { templateName: 'paylab_bench' }),
		).toThrow(/template/)
		expect(() => assertBenchDatabaseUrl(url('paylab_bench'), { templateName: 'x"; --' })).toThrow(
			/template/,
		)
	})
})
