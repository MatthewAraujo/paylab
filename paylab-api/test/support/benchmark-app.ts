import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { BENCHMARK_CONFIG } from '@/infra/benchmark/benchmark.config'
import { INestApplication } from '@nestjs/common'
import { buildTestApp } from './app'
import { buildScenario, buildSummary } from './benchmark-fixtures'
import { type TempRepo, createTempRepo } from './git-repo'

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
	/** Only with `git: true`: commits everything, like the developer does after reviewing. */
	commit(): void
	/** Only with `git: true`. */
	git(...args: string[]): string
	close(): Promise<void>
}

/** The real application with a temporary benchmark workspace instead of the repository's. */
export async function buildBenchmarkApp(
	enabled = true,
	options: { git?: boolean } = {},
): Promise<BenchmarkFixture> {
	// With `git`, the workspace is a real clean repository whose `.benchmark/` is ignored.
	const repo: TempRepo | null = options.git ? createTempRepo() : null
	const root = repo ? repo.repoDir : mkdtempSync(join(tmpdir(), 'paylab-bench-e2e-'))
	const summaryDir = join(root, 'bench', 'results')
	const artifactRoot = join(root, '.benchmark')
	const baselineFile = join(root, 'bench', 'baseline.json')

	const app = await buildTestApp((builder) =>
		builder.overrideProvider(BENCHMARK_CONFIG).useValue({
			enabled,
			paths: { rootDir: root, summaryDir, artifactRoot, baselineFile, secrets: [SECRET] },
		}),
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
		commit() {
			if (!repo) throw new Error('buildBenchmarkApp({ git: true }) is required')
			repo.git('add', '-A')
			repo.git('commit', '-q', '-m', 'save')
		},
		git(...args: string[]) {
			if (!repo) throw new Error('buildBenchmarkApp({ git: true }) is required')
			return repo.git(...args)
		},
		async close() {
			await app.close()
			rmSync(root, { recursive: true, force: true })
		},
	}
}
