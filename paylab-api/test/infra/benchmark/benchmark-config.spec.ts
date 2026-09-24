import { isAbsolute } from 'node:path'
import { benchmarkConfigFromEnv } from '@/infra/benchmark/benchmark.config'
import { buildEnv } from '@/infra/env/env'
import type { EnvService } from '@/infra/env/env.service'

const base = { DATABASE_URL: 'postgresql://paylab:paylab@localhost:5432/paylab' }
const configFor = (input: Record<string, unknown>) => {
	const env = buildEnv({ ...base, ...input })
	return benchmarkConfigFromEnv({
		get: (key: keyof typeof env) => env[key],
	} as unknown as EnvService)
}

describe('benchmarkConfigFromEnv', () => {
	it('keeps the surface off in production and by default outside development', () => {
		expect(configFor({ NODE_ENV: 'production' }).enabled).toBe(false)
		expect(configFor({ NODE_ENV: 'test' }).enabled).toBe(false)
	})

	it('turns it on in development, and can be switched off there', () => {
		expect(configFor({ NODE_ENV: 'development' }).enabled).toBe(true)
		expect(configFor({ NODE_ENV: 'development', BENCHMARK_ENABLED: 'false' }).enabled).toBe(false)
	})

	it('resolves the evidence locations to absolute paths from the working directory', () => {
		const { paths } = configFor({ NODE_ENV: 'development' })

		expect(isAbsolute(paths.summaryDir)).toBe(true)
		expect(paths.summaryDir.endsWith('bench/results')).toBe(true)
		expect(paths.artifactRoot.endsWith('.benchmark')).toBe(true)
		expect(paths.baselineFile.endsWith('bench/baseline.json')).toBe(true)
		// Never inside the Summary directory, where every JSON file is a Run.
		expect(paths.baselineFile.startsWith(`${paths.summaryDir}/`)).toBe(false)
		expect(paths.rootDir).toBe(process.cwd())
	})
})
