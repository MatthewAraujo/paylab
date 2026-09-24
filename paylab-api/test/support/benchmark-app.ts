import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { BENCHMARK_CONFIG } from '@/infra/benchmark/benchmark.config'
import { INestApplication } from '@nestjs/common'
import { buildTestApp } from './app'
import { buildScenario, buildSummary } from './benchmark-fixtures'

export const SECRET = 'hunter2-private-value'

export interface BenchmarkFixture {
	app: INestApplication
	root: string
	/** Publishes a Summary in the versioned directory. */
	publish(overrides?: Record<string, unknown>): Record<string, any>
	/** Writes the local RUNNING record of an active Run. */
	running(runId: string, overrides?: Record<string, unknown>): Record<string, any>
	/** Writes any file under the working root, creating directories. */
	write(relativePath: string, content: string): void
	artifact(runId: string, fileName: string, content: string): void
	close(): Promise<void>
}

/** The real application with a temporary benchmark workspace instead of the repository's. */
export async function buildBenchmarkApp(enabled = true): Promise<BenchmarkFixture> {
	const root = mkdtempSync(join(tmpdir(), 'paylab-bench-e2e-'))
	const summaryDir = join(root, 'bench', 'results')
	const artifactRoot = join(root, '.benchmark')

	const app = await buildTestApp((builder) =>
		builder
			.overrideProvider(BENCHMARK_CONFIG)
			.useValue({ enabled, paths: { rootDir: root, summaryDir, artifactRoot, secrets: [SECRET] } }),
	)

	const write = (relativePath: string, content: string) => {
		const target = join(root, relativePath)
		mkdirSync(dirname(target), { recursive: true })
		writeFileSync(target, content)
	}

	return {
		app,
		root,
		write,
		publish(overrides = {}) {
			const summary = buildSummary(overrides)
			write(join('bench', 'results', `${summary.runId}.json`), JSON.stringify(summary))
			return summary
		},
		running(runId, overrides = {}) {
			const state = buildSummary({
				runId,
				status: 'RUNNING',
				finishedAt: undefined,
				durationMs: undefined,
				scenarios: [buildScenario({ id: 'fake.a', status: 'ACTIVE', metrics: [] })],
				...overrides,
			})
			write(join('.benchmark', 'runs', runId, 'state.json'), JSON.stringify(state))
			return state
		},
		artifact: (runId, fileName, content) =>
			write(join('.benchmark', 'runs', runId, 'artifacts', fileName), content),
		async close() {
			await app.close()
			rmSync(root, { recursive: true, force: true })
		},
	}
}
