import { buildEnv } from '@/infra/env/env'

const base = { DATABASE_URL: 'postgresql://paylab:paylab@localhost:5432/paylab' }

describe('benchmark capability configuration', () => {
	it('is on by default in development only', () => {
		expect(buildEnv({ ...base, NODE_ENV: 'development' }).BENCHMARK_ENABLED).toBe(true)
		expect(buildEnv({ ...base, NODE_ENV: 'test' }).BENCHMARK_ENABLED).toBe(false)
		expect(buildEnv({ ...base, NODE_ENV: 'production' }).BENCHMARK_ENABLED).toBe(false)
	})

	it('can be switched explicitly outside production', () => {
		expect(
			buildEnv({ ...base, NODE_ENV: 'development', BENCHMARK_ENABLED: 'false' }).BENCHMARK_ENABLED,
		).toBe(false)
		expect(
			buildEnv({ ...base, NODE_ENV: 'test', BENCHMARK_ENABLED: 'true' }).BENCHMARK_ENABLED,
		).toBe(true)
	})

	it('refuses to start in production with the benchmark surface enabled', () => {
		expect(() => buildEnv({ ...base, NODE_ENV: 'production', BENCHMARK_ENABLED: 'true' })).toThrow(
			/production/,
		)
	})

	it('rejects a value that is not true or false', () => {
		expect(() => buildEnv({ ...base, BENCHMARK_ENABLED: 'yes' })).toThrow()
	})

	it('locates the versioned Summaries and the local Artifacts, with local defaults', () => {
		const env = buildEnv(base)

		expect(env.BENCH_SUMMARY_DIR).toBe('bench/results')
		expect(env.BENCH_ARTIFACT_ROOT).toBe('.benchmark')
		expect(env.BENCH_BASELINE_FILE).toBe('bench/baseline.json')
		expect(
			buildEnv({ ...base, BENCH_SUMMARY_DIR: '/tmp/s', BENCH_ARTIFACT_ROOT: '/tmp/a' }),
		).toMatchObject({ BENCH_SUMMARY_DIR: '/tmp/s', BENCH_ARTIFACT_ROOT: '/tmp/a' })
	})
})
