import { resolve } from 'node:path'
import { EnvService } from '@/infra/env/env.service'
import type { BenchmarkPaths } from './benchmark-store'

export const BENCHMARK_CONFIG = Symbol('BENCHMARK_CONFIG')

export interface BenchmarkConfig {
	/** False (the default outside development, forced in production) makes every route answer 404. */
	enabled: boolean
	paths: BenchmarkPaths
}

export function benchmarkConfigFromEnv(env: EnvService): BenchmarkConfig {
	return {
		enabled: env.get('BENCHMARK_ENABLED'),
		paths: {
			rootDir: process.cwd(),
			summaryDir: resolve(env.get('BENCH_SUMMARY_DIR')),
			artifactRoot: resolve(env.get('BENCH_ARTIFACT_ROOT')),
			baselineFile: resolve(env.get('BENCH_BASELINE_FILE')),
		},
	}
}
