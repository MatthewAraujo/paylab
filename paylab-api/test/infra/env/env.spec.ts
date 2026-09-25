import { buildEnv } from '@/infra/env/env'

const DATABASE_URL = 'postgresql://paylab:paylab@localhost:5432/paylab'

describe('buildEnv', () => {
	test('accepts the PayLab baseline environment with defaults', () => {
		const env = buildEnv({ DATABASE_URL })

		expect(env).toEqual({
			APP_NAME: 'paylab-api',
			LOG_ENABLED: false,
			LOG_LEVEL: 'basic',
			DATABASE_URL,
			NODE_ENV: 'development',
			PORT: 3333,
			BENCHMARK_ENABLED: true,
			BENCH_SUMMARY_DIR: 'bench/results',
			BENCH_ARTIFACT_ROOT: '.benchmark',
			BENCH_BASELINE_FILE: 'bench/baseline.json',
		})
	})

	test('rejects a missing database URL', () => {
		expect(() => buildEnv({})).toThrow()
	})

	test('rejects an invalid database URL', () => {
		expect(() => buildEnv({ DATABASE_URL: 'not-a-url' })).toThrow()
	})

	test('accepts structured logging configuration', () => {
		const env = buildEnv({ DATABASE_URL, LOG_ENABLED: 'true', LOG_LEVEL: 'debug' })

		expect(env).toMatchObject({ LOG_ENABLED: true, LOG_LEVEL: 'debug' })
	})

	test('rejects an unknown log level', () => {
		expect(() => buildEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow()
	})
})
