import {
	PreflightError,
	loadBenchDatabase,
	prepareBenchmarkDatabase,
} from '../../bench/lib/preflight'

const url = (name: string, port = 5433) => `postgresql://paylab:paylab@localhost:${port}/${name}`

describe('loadBenchDatabase', () => {
	it('builds the database and template from the environment', () => {
		const database = loadBenchDatabase({
			BENCH_DATABASE_URL: url('paylab_bench'),
			BENCH_TEMPLATE_DATABASE: 'paylab_bench_adopted',
			DATABASE_URL: url('paylab', 5432),
		})

		expect(database).toMatchObject({ name: 'paylab_bench', templateName: 'paylab_bench_adopted' })
	})

	it('reports an unset or forbidden database as an environment failure with the reason', () => {
		const failure = (env: Record<string, string>) => {
			try {
				loadBenchDatabase(env)
			} catch (error) {
				return error as PreflightError
			}
			throw new Error('expected a failure')
		}

		expect(failure({})).toMatchObject({ step: 'environment' })
		expect(failure({}).message).toMatch(/BENCH_DATABASE_URL is not set/)
		expect(failure({ BENCH_DATABASE_URL: url('paylab') }).message).toMatch(/must contain "bench"/)
		expect(
			failure({ BENCH_DATABASE_URL: url('paylab_bench'), DATABASE_URL: url('paylab_bench') })
				.message,
		).toMatch(/development or test database/)
	})
})

describe('prepareBenchmarkDatabase', () => {
	it('names PostgreSQL as the problem, with the way to start it, when it is unreachable', async () => {
		const database = {
			url: url('paylab_bench', 1),
			name: 'paylab_bench',
			templateName: 'paylab_bench_template',
		}

		const failure = await prepareBenchmarkDatabase(database).then(
			() => null,
			(error) => error as PreflightError,
		)

		expect(failure).toBeInstanceOf(PreflightError)
		expect(failure?.step).toBe('postgres')
		expect(failure?.message).toContain('pnpm bench:up')
	})
})
