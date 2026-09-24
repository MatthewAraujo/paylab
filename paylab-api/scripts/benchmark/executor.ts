import { spawn } from 'node:child_process'
import { relative, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { scenarioFingerprint } from '@/domain/benchmark/canonical'
import {
	type BenchmarkMetric,
	type BenchmarkScenario,
	type BenchmarkSummary,
	metricSchema,
	parseSummary,
	safeId,
} from '@/domain/benchmark/summary'
import { captureEnvironment } from './environment'
import { assertCleanWorktree } from './git'
import { acquireLock } from './lock'
import { recoverAbandonedRun } from './recovery'
import { createSanitizer } from './sanitize'
import { appendArtifactLine, artifactPath, publishSummary, removeState, writeState } from './store'

const RESULT_PREFIX = 'BENCH_RESULT '

export interface ScenarioSpec {
	definition: {
		id: string
		group: string
		title: string
		protocol: BenchmarkScenario['protocol']
		config: Record<string, unknown>
	}
	command: string
	args: string[]
	cwd?: string
	env?: Record<string, string>
}

export interface DatasetInfo {
	fingerprint: string
	description?: string
}

/** Everything a full Run needs from the registered benchmarks; there is no partial suite. */
export interface BenchmarkSuite {
	/** Preflight and deterministic reset. Returns the dataset the measurements were taken on. */
	prepare(): Promise<DatasetInfo>
	scenarios: ScenarioSpec[]
}

export interface Progress {
	runId: string
	message: string
}

export interface RunOptions {
	repoDir: string
	artifactRoot: string
	summaryDir: string
	suite: BenchmarkSuite
	executorVersion: string
	note?: string
	secrets?: string[]
	environment?: Record<string, string>
	now?: () => Date
	/** Aborting stops the running scenario and publishes the Run as INCOMPLETE. */
	signal?: AbortSignal
	onProgress?: (progress: Progress) => void
}

export interface RunResult {
	summary: BenchmarkSummary
	/** Generated versioned files, relative to the repository, waiting for manual review. */
	files: string[]
	suggestedCommitMessage: string
}

const stamp = (date: Date) =>
	date
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/:/g, '-')

function assertValid(summary: BenchmarkSummary): BenchmarkSummary {
	const parsed = parseSummary(summary)
	if (parsed.isLeft()) {
		throw parsed.value
	}
	return parsed.value
}

interface ProcessResult {
	exitCode: number | null
	metrics: BenchmarkMetric[] | null
	lastLine: string
}

function runProcess(
	spec: ScenarioSpec,
	logPath: string,
	sanitize: (line: string) => string,
	signal?: AbortSignal,
): Promise<ProcessResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(spec.command, spec.args, {
			cwd: spec.cwd,
			env: { ...process.env, ...spec.env },
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let metrics: BenchmarkMetric[] | null = null
		let lastLine = ''
		const onLine = (line: string) => {
			if (line.startsWith(RESULT_PREFIX)) {
				const parsed = metricSchema.array().safeParse(JSON.parse(line.slice(RESULT_PREFIX.length)))
				if (parsed.success) {
					metrics = parsed.data
				}
			}
			const safe = sanitize(line)
			if (safe.trim().length > 0) {
				lastLine = safe.trim()
			}
			appendArtifactLine(logPath, safe)
		}

		const streams = [child.stdout, child.stderr].map(
			(stream) =>
				new Promise<void>((done) => {
					const lines = createInterface({ input: stream })
					lines.on('line', onLine)
					lines.on('close', done)
				}),
		)
		const stop = () => {
			child.kill('SIGTERM')
			// A scenario that ignores SIGTERM must not keep the Run, and the lock, alive.
			setTimeout(() => child.kill('SIGKILL'), 2000).unref()
		}
		if (signal?.aborted) stop()
		signal?.addEventListener('abort', stop, { once: true })
		child.on('error', reject)
		child.on('close', async (exitCode) => {
			await Promise.all(streams)
			resolve({ exitCode, metrics, lastLine })
		})
	})
}

export async function runBenchmark(options: RunOptions): Promise<RunResult> {
	const { repoDir, artifactRoot, summaryDir, suite } = options
	const now = options.now ?? (() => new Date())
	const sanitize = createSanitizer({ secrets: options.secrets })

	// Scenario ids become Artifact file names, so they are checked before anything is written.
	for (const spec of suite.scenarios) {
		if (!safeId.safeParse(spec.definition.id).success) {
			throw new Error(`Unsafe scenario id "${spec.definition.id}": it is used as a file name`)
		}
	}

	const lock = acquireLock(artifactRoot, {
		recoverStale: (record) => {
			const recovered = recoverAbandonedRun({ artifactRoot, summaryDir, record, now })
			if (recovered) {
				options.onProgress?.({
					runId: record?.runId ?? '',
					message: `Recovered abandoned Run as INCOMPLETE: ${recovered}`,
				})
			}
		},
	})
	try {
		const source = assertCleanWorktree(repoDir)
		const startedAt = now()
		const runId = `${stamp(startedAt)}-${source.commit.slice(0, 7)}`
		lock.setRunId(runId)

		let state: BenchmarkSummary = {
			schemaVersion: 1,
			runId,
			kind: 'native',
			status: 'RUNNING',
			note: options.note,
			source,
			startedAt: startedAt.toISOString(),
			executor: { version: options.executorVersion },
			environment: captureEnvironment(options.environment),
			dataset: { fingerprint: 'pending' },
			scenarios: suite.scenarios.map((spec) => ({
				...spec.definition,
				fingerprint: scenarioFingerprint(spec.definition),
				status: 'PENDING' as const,
				metrics: [],
			})),
			artifacts: [],
		}

		const persist = (message: string) => {
			assertValid(state)
			writeState(artifactRoot, state)
			options.onProgress?.({ runId, message })
		}

		persist('Run started')

		let failure: BenchmarkSummary['failure']
		try {
			state.dataset = await suite.prepare()
			persist('Dataset prepared')
		} catch (error) {
			failure = { summary: sanitize(`Preparation failed: ${(error as Error).message}`) }
		}

		for (const [index, spec] of suite.scenarios.entries()) {
			if (failure) {
				break
			}
			const scenario = state.scenarios[index]
			const scenarioId = spec.definition.id
			const scenarioStart = now()
			scenario.status = 'ACTIVE'
			scenario.startedAt = scenarioStart.toISOString()
			persist(`Running ${scenarioId}`)

			const artifactId = `${scenarioId}-log`
			const result = await runProcess(
				spec,
				artifactPath(artifactRoot, runId, artifactId),
				sanitize,
				options.signal,
			)
			const scenarioEnd = now()
			scenario.finishedAt = scenarioEnd.toISOString()
			scenario.durationMs = scenarioEnd.getTime() - scenarioStart.getTime()
			state.artifacts.push({ id: artifactId, kind: 'LOG', label: `${scenarioId} log`, scenarioId })

			if (result.exitCode === 0 && result.metrics) {
				scenario.status = 'COMPLETED'
				scenario.metrics = result.metrics
				persist(`Completed ${scenarioId}`)
				continue
			}

			scenario.status = 'FAILED'
			const interrupted = options.signal?.aborted === true
			failure = {
				scenarioId,
				command: sanitize([spec.command, ...spec.args].join(' ')),
				exitStatus: interrupted ? undefined : (result.exitCode ?? undefined),
				summary: interrupted
					? `Interrupted while running ${scenarioId}`
					: result.exitCode === 0
						? `Scenario ${scenarioId} finished with no result`
						: `Scenario ${scenarioId} exited with status ${result.exitCode}: ${result.lastLine}`,
			}
			persist(`${interrupted ? 'Interrupted' : 'Failed'} ${scenarioId}`)
		}

		const finishedAt = now()
		state = assertValid({
			...state,
			status: failure ? 'INCOMPLETE' : 'COMPLETED',
			failure,
			finishedAt: finishedAt.toISOString(),
			durationMs: finishedAt.getTime() - startedAt.getTime(),
		})
		const published = publishSummary(summaryDir, state)
		removeState(artifactRoot, runId)

		return {
			summary: state,
			files: [relative(repoDir, published).split(sep).join('/')],
			suggestedCommitMessage: `chore(bench): publish benchmark run ${runId}`,
		}
	} finally {
		lock.release()
	}
}
