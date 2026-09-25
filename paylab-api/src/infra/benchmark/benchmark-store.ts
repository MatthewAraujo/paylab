import {
	closeSync,
	createReadStream,
	existsSync,
	fstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	readdirSync,
	realpathSync,
	renameSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { artifactFileName } from '@/domain/benchmark/artifact'
import {
	BASELINE_SCHEMA_VERSION,
	type BenchmarkBaseline,
	parseBaseline,
} from '@/domain/benchmark/baseline'
import { canonicalJson } from '@/domain/benchmark/canonical'
import { collectSecrets, createSanitizer } from '@/domain/benchmark/sanitize'
import { type BenchmarkSummary, parseSummary, safeId } from '@/domain/benchmark/summary'
import { type GitState, readGitState } from './git-status'
import { SanitizingLines } from './sanitizing-lines'

export interface BenchmarkPaths {
	/** The repository root of the API: imported Runs reference evidence relative to it. */
	rootDir: string
	/** Versioned, immutable Summaries (`bench/results`). */
	summaryDir: string
	/** Local, ignored state and Artifacts (`.benchmark`). */
	artifactRoot: string
	/** The versioned pointer to the Baseline Run (`bench/baseline.json`). */
	baselineFile: string
	/** Values to redact when serving text; defaults to the ones the executor redacts. */
	secrets?: string[]
}

export type ArtifactRef = BenchmarkSummary['artifacts'][number]

export interface ArtifactFile {
	ref: ArtifactRef
	/** Set only when the file exists and lies inside its allowed directory. */
	path: string | null
	available: boolean
	sizeBytes?: number
}

export interface ArtifactChunk {
	content: string
	offset: number
	/** Byte position of the next chunk, or null at the end of the file. */
	nextOffset: number | null
	sizeBytes: number
}

export interface LoadedRuns {
	runs: BenchmarkSummary[]
	/** Records that could not be read: reported, never allowed to break the history. */
	skipped: { file: string; reason: string }[]
}

function readSummaryFile(path: string): { summary?: BenchmarkSummary; reason?: string } {
	let json: unknown
	try {
		json = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return { reason: 'not valid JSON' }
	}
	const parsed = parseSummary(json)
	return parsed.isLeft() ? { reason: parsed.value.message } : { summary: parsed.value }
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM'
	}
}

/** The largest end position at or below `end` that does not cut a UTF-8 character in half. */
function utf8SafeEnd(buffer: Buffer, end: number): number {
	let at = end
	while (at > 0 && end - at < 4 && (buffer[at - 1] & 0xc0) === 0x80) at--
	if (at > 0) {
		const lead = buffer[at - 1]
		const needed = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1
		if (needed > end - (at - 1)) return at - 1
	}
	return end
}

/**
 * Read-only access to benchmark evidence on disk. Clients never name a path: a Run is found
 * by a validated identifier, an Artifact only through the references its own record lists, and
 * every file must resolve (symlinks included) inside the directory it belongs to.
 */
export class BenchmarkStore {
	private readonly sanitize: (line: string) => string

	constructor(private readonly paths: BenchmarkPaths) {
		this.sanitize = createSanitizer({ secrets: paths.secrets ?? collectSecrets(process.env) })
	}

	private get runsDir() {
		return join(this.paths.artifactRoot, 'runs')
	}

	private statePath(runId: string) {
		return join(this.runsDir, runId, 'state.json')
	}

	loadRuns(): LoadedRuns {
		const runs: BenchmarkSummary[] = []
		const skipped: LoadedRuns['skipped'] = []
		const published = new Set<string>()

		if (existsSync(this.paths.summaryDir)) {
			for (const file of readdirSync(this.paths.summaryDir).sort()) {
				if (!file.endsWith('.json')) continue
				const { summary, reason } = readSummaryFile(join(this.paths.summaryDir, file))
				if (!summary) {
					skipped.push({ file, reason: reason ?? 'unreadable' })
				} else if (`${summary.runId}.json` !== file) {
					skipped.push({ file, reason: 'the file name does not match the run id' })
				} else {
					runs.push(summary)
					published.add(summary.runId)
				}
			}
		}

		if (existsSync(this.runsDir)) {
			for (const runId of readdirSync(this.runsDir).sort()) {
				if (published.has(runId) || !existsSync(this.statePath(runId))) continue
				const { summary, reason } = readSummaryFile(this.statePath(runId))
				if (summary?.runId === runId && summary.status === 'RUNNING') {
					runs.push(summary)
				} else if (!summary) {
					skipped.push({ file: `runs/${runId}/state.json`, reason: reason ?? 'unreadable' })
				}
			}
		}
		return { runs, skipped }
	}

	findRun(runId: string): BenchmarkSummary | null {
		if (!safeId.safeParse(runId).success) {
			return null
		}
		const published = join(this.paths.summaryDir, `${runId}.json`)
		if (existsSync(published)) {
			const { summary } = readSummaryFile(published)
			return summary?.runId === runId ? summary : null
		}
		if (existsSync(this.statePath(runId))) {
			const { summary } = readSummaryFile(this.statePath(runId))
			return summary?.runId === runId && summary.status === 'RUNNING' ? summary : null
		}
		return null
	}

	/** The Run whose owner process is alive right now, if any. */
	activeRunId(): string | null {
		try {
			const lock = JSON.parse(readFileSync(join(this.paths.artifactRoot, 'lock.json'), 'utf8'))
			return typeof lock.pid === 'number' && typeof lock.runId === 'string' && isAlive(lock.pid)
				? lock.runId
				: null
		} catch {
			return null
		}
	}

	/** A RUNNING record nobody owns any more; the next executor invocation will recover it. */
	isAbandoned(runId: string): boolean {
		const state = existsSync(this.statePath(runId)) && this.findRun(runId)
		return Boolean(state && state.status === 'RUNNING' && this.activeRunId() !== runId)
	}

	/** The log of the scenario running now is written from the start, before it is registered. */
	private liveRefs(run: BenchmarkSummary): ArtifactRef[] {
		if (run.status !== 'RUNNING') {
			return []
		}
		return run.scenarios
			.filter((scenario) => scenario.status === 'ACTIVE')
			.map((scenario) => ({
				id: `${scenario.id}-log`,
				kind: 'LOG' as const,
				label: `${scenario.id} log (live)`,
				scenarioId: scenario.id,
			}))
			.filter((ref) => !run.artifacts.some((declared) => declared.id === ref.id))
	}

	private locate(run: BenchmarkSummary, ref: ArtifactRef): ArtifactFile {
		const local = join(this.paths.artifactRoot, 'runs', run.runId, 'artifacts')
		const [base, candidate] = ref.legacyFile
			? [join(this.paths.rootDir, 'docs', 'experiments'), join(this.paths.rootDir, ref.legacyFile)]
			: [local, join(local, artifactFileName(ref))]

		try {
			const realBase = realpathSync(base)
			const real = realpathSync(candidate)
			const stats = statSync(real)
			if (real.startsWith(realBase + sep) && stats.isFile()) {
				return { ref, path: real, available: true, sizeBytes: stats.size }
			}
		} catch {
			// missing file or directory: reported as unavailable below
		}
		return { ref, path: null, available: false }
	}

	listArtifacts(run: BenchmarkSummary): ArtifactFile[] {
		const live = this.liveRefs(run)
			.map((ref) => this.locate(run, ref))
			.filter((file) => file.available)
		return [...run.artifacts.map((ref) => this.locate(run, ref)), ...live]
	}

	resolveArtifact(run: BenchmarkSummary, artifactId: string): ArtifactFile | null {
		const declared = run.artifacts.find((ref) => ref.id === artifactId)
		if (declared) {
			return this.locate(run, declared)
		}
		const live = this.liveRefs(run).find((ref) => ref.id === artifactId)
		return live ? this.locate(run, live) : null
	}

	readArtifact(file: ArtifactFile, options: { offset: number; limit: number }): ArtifactChunk {
		if (!file.path) {
			throw new Error('The Artifact is not available')
		}
		const fd = openSync(file.path, 'r')
		try {
			const size = fstatSync(fd).size
			const { offset } = options
			if (offset >= size) {
				return { content: '', offset, nextOffset: null, sizeBytes: size }
			}

			const length = Math.min(options.limit, size - offset)
			const buffer = Buffer.alloc(length)
			readSync(fd, buffer, 0, length, offset)

			let end = length
			if (offset + length < size) {
				// Whole lines when there is one, otherwise cut at a character boundary.
				const newline = buffer.lastIndexOf(0x0a)
				end = newline >= 0 ? newline + 1 : utf8SafeEnd(buffer, length) || length
			}
			const content = buffer
				.subarray(0, end)
				.toString('utf8')
				.split('\n')
				.map(this.sanitize)
				.join('\n')
			return {
				content,
				offset,
				nextOffset: offset + end >= size ? null : offset + end,
				sizeBytes: size,
			}
		} finally {
			closeSync(fd)
		}
	}

	openArtifact(file: ArtifactFile): Readable {
		if (!file.path) {
			throw new Error('The Artifact is not available')
		}
		const source = createReadStream(file.path)
		const sanitized = new SanitizingLines(this.sanitize)
		source.on('error', (error) => sanitized.destroy(error))
		return source.pipe(sanitized)
	}

	readBaseline(): { baseline: BenchmarkBaseline | null; problem?: string } {
		if (!existsSync(this.paths.baselineFile)) {
			return { baseline: null }
		}
		let json: unknown
		try {
			json = JSON.parse(readFileSync(this.paths.baselineFile, 'utf8'))
		} catch {
			return { baseline: null, problem: 'The Baseline file is not valid JSON.' }
		}
		const parsed = parseBaseline(json)
		return parsed.isLeft()
			? { baseline: null, problem: parsed.value.message }
			: { baseline: parsed.value }
	}

	/**
	 * Points the Baseline at a Run. Only the small pointer file changes (atomically); the Run's
	 * Summary is never touched and nothing is committed. Selecting the current Baseline again
	 * writes nothing, so the worktree does not change for no reason.
	 */
	writeBaseline(
		runId: string,
		now: Date = new Date(),
	): { baseline: BenchmarkBaseline; changed: boolean } {
		const baseline = {
			schemaVersion: BASELINE_SCHEMA_VERSION,
			runId,
			selectedAt: now.toISOString(),
		}
		const parsed = parseBaseline(baseline)
		if (parsed.isLeft()) {
			throw parsed.value
		}

		const current = this.readBaseline().baseline
		if (current?.runId === runId) {
			return { baseline: current, changed: false }
		}

		mkdirSync(dirname(this.paths.baselineFile), { recursive: true })
		const temp = `${this.paths.baselineFile}.${process.pid}.tmp`
		writeFileSync(temp, `${canonicalJson(parsed.value, 2)}\n`)
		renameSync(temp, this.paths.baselineFile)
		return { baseline: parsed.value, changed: true }
	}

	/** The pending Git change, as `benchmark:run` sees it. */
	gitState(): GitState {
		return readGitState(this.paths.rootDir, this.paths.baselineFile)
	}
}
