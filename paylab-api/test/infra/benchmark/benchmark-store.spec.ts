import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { text } from 'node:stream/consumers'
import { BenchmarkStore } from '@/infra/benchmark/benchmark-store'
import { buildMetric, buildScenario, buildSummary } from '../../support/benchmark-fixtures'

const SECRET = 'hunter2-private-value'

describe('BenchmarkStore', () => {
	let root: string
	let store: BenchmarkStore
	const summaryDir = () => join(root, 'bench', 'results')
	const artifactRoot = () => join(root, '.benchmark')

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'paylab-bench-store-'))
		store = new BenchmarkStore({
			rootDir: root,
			summaryDir: summaryDir(),
			artifactRoot: artifactRoot(),
			secrets: [SECRET],
		})
	})
	afterEach(() => rmSync(root, { recursive: true, force: true }))

	const write = (path: string, content: string) => {
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	const publish = (overrides: Record<string, unknown> = {}) => {
		const summary = buildSummary(overrides)
		write(join(summaryDir(), `${summary.runId}.json`), JSON.stringify(summary))
		return summary
	}
	const running = (runId: string, extra: Record<string, unknown> = {}) => {
		const state = buildSummary({
			runId,
			status: 'RUNNING',
			finishedAt: undefined,
			durationMs: undefined,
			scenarios: [buildScenario({ id: 'fake.a', status: 'ACTIVE', metrics: [] })],
			...extra,
		})
		write(join(artifactRoot(), 'runs', runId, 'state.json'), JSON.stringify(state))
		return state
	}
	const runOf = (runId: string) => {
		const run = store.findRun(runId)
		if (!run) throw new Error(`no run ${runId}`)
		return run
	}
	const artifactOf = (runId: string, artifactId: string) => {
		const file = store.resolveArtifact(runOf(runId), artifactId)
		if (!file) throw new Error(`no artifact ${artifactId}`)
		return file
	}
	const artifactDir = (runId: string) => join(artifactRoot(), 'runs', runId, 'artifacts')

	describe('loading Runs', () => {
		it('is empty when nothing has been published', () => {
			expect(store.loadRuns()).toEqual({ runs: [], skipped: [] })
		})

		it('reads published Summaries, and isolates a malformed record instead of failing the history', () => {
			publish({ runId: 'good' })
			write(join(summaryDir(), 'broken.json'), '{not json')
			write(
				join(summaryDir(), 'invalid.json'),
				JSON.stringify({ schemaVersion: 1, runId: 'invalid' }),
			)
			write(join(summaryDir(), 'wrong-name.json'), JSON.stringify(buildSummary({ runId: 'other' })))
			write(join(summaryDir(), 'notes.txt'), 'ignored')

			const { runs, skipped } = store.loadRuns()

			expect(runs.map((r) => r.runId)).toEqual(['good'])
			expect(skipped.map((s) => s.file).sort()).toEqual([
				'broken.json',
				'invalid.json',
				'wrong-name.json',
			])
			expect(skipped.find((s) => s.file === 'wrong-name.json')?.reason).toMatch(/run id/i)
		})

		it('includes a Run that is still running, unless it has already been published', () => {
			running('live-1')
			running('done-1')
			publish({ runId: 'done-1' })

			const { runs } = store.loadRuns()

			expect(runs.map((r) => [r.runId, r.status]).sort()).toEqual([
				['done-1', 'COMPLETED'],
				['live-1', 'RUNNING'],
			])
		})

		it('finds one Run by id, and nothing for an unknown or unsafe id', () => {
			publish({ runId: 'good' })

			expect(store.findRun('good')?.runId).toBe('good')
			expect(store.findRun('missing')).toBeNull()
			expect(store.findRun('../good')).toBeNull()
		})
	})

	describe('the active Run', () => {
		const lock = (pid: number, runId: string) =>
			write(
				join(artifactRoot(), 'lock.json'),
				JSON.stringify({ pid, runId, startedAt: '2026-09-23T10:00:00.000Z' }),
			)

		it('is the Run whose owner process is alive', () => {
			running('live-1')
			lock(process.pid, 'live-1')

			expect(store.activeRunId()).toBe('live-1')
			expect(store.isAbandoned('live-1')).toBe(false)
		})

		it('is nothing, and the RUNNING record is abandoned, when the owner is gone', () => {
			running('dead-1')
			lock(2 ** 22 + 12345, 'dead-1')

			expect(store.activeRunId()).toBeNull()
			expect(store.isAbandoned('dead-1')).toBe(true)
		})

		it('is nothing without a lock', () => {
			expect(store.activeRunId()).toBeNull()
		})
	})

	describe('Artifacts', () => {
		it('resolves a local Artifact from the Run’s own references, with its size', () => {
			const summary = publish({
				runId: 'r1',
				artifacts: [{ id: 'fake.a-log', kind: 'LOG', label: 'log', scenarioId: 'fake.a' }],
			})
			write(join(artifactDir('r1'), 'fake.a-log.log'), 'line one\nline two\n')

			const file = store.resolveArtifact(runOf(summary.runId as string), 'fake.a-log')

			expect(file).toMatchObject({
				ref: { id: 'fake.a-log', kind: 'LOG' },
				available: true,
				sizeBytes: 18,
			})
		})

		it('reports a referenced Artifact whose file is gone as unavailable, not as an error', () => {
			publish({ runId: 'r1', artifacts: [{ id: 'gone', kind: 'LOG', label: 'log' }] })

			const file = store.resolveArtifact(runOf('r1'), 'gone')

			expect(file).toMatchObject({ available: false })
		})

		it('knows only the Artifacts the record lists', () => {
			publish({ runId: 'r1' })
			write(join(artifactDir('r1'), 'stray.log'), 'not referenced')

			expect(store.resolveArtifact(runOf('r1'), 'stray')).toBeNull()
			expect(store.resolveArtifact(runOf('r1'), '../../state')).toBeNull()
		})

		it('refuses a file that resolves outside the Artifact directory (symlink escape)', () => {
			publish({ runId: 'r1', artifacts: [{ id: 'escape', kind: 'LOG', label: 'log' }] })
			write(join(root, 'outside.txt'), 'top secret')
			mkdirSync(artifactDir('r1'), { recursive: true })
			symlinkSync(join(root, 'outside.txt'), join(artifactDir('r1'), 'escape.log'))

			expect(store.resolveArtifact(runOf('r1'), 'escape')).toMatchObject({
				available: false,
			})
		})

		it('resolves an imported Run’s evidence in place under docs/experiments, and nowhere else', () => {
			write(join(root, 'docs', 'experiments', 'raw', 'T14-load.jsonl'), '{"a":1}\n')
			publish({
				runId: 'imp',
				kind: 'imported',
				imported: { source: 'docs/experiments/T14-results.md' },
				artifacts: [
					{
						id: 'load',
						kind: 'RAW_DATA',
						label: 'raw',
						legacyFile: 'docs/experiments/raw/T14-load.jsonl',
					},
				],
			})

			expect(store.resolveArtifact(runOf('imp'), 'load')).toMatchObject({
				available: true,
				sizeBytes: 8,
			})
		})

		it('shows the log of the scenario that is running now, before it is registered', () => {
			running('live-1')
			write(join(artifactDir('live-1'), 'fake.a-log.log'), 'started\n')

			const run = runOf('live-1')

			expect(store.listArtifacts(run)).toEqual([
				expect.objectContaining({
					ref: expect.objectContaining({ id: 'fake.a-log', kind: 'LOG', scenarioId: 'fake.a' }),
					available: true,
				}),
			])
			expect(store.resolveArtifact(run, 'fake.a-log')).toMatchObject({ available: true })
		})
	})

	describe('reading an Artifact', () => {
		const logRun = (content: string) => {
			publish({ runId: 'r1', artifacts: [{ id: 'l', kind: 'LOG', label: 'log' }] })
			write(join(artifactDir('r1'), 'l.log'), content)
			return artifactOf('r1', 'l')
		}

		it('reads it in bounded chunks of whole lines, and says where the next one starts', () => {
			const file = logRun('aaaa\nbbbb\ncccc\ndddd\n')

			const first = store.readArtifact(file, { offset: 0, limit: 12 })
			const second = store.readArtifact(file, { offset: first.nextOffset as number, limit: 12 })

			expect(first).toMatchObject({
				content: 'aaaa\nbbbb\n',
				offset: 0,
				nextOffset: 10,
				sizeBytes: 20,
			})
			expect(second).toMatchObject({ content: 'cccc\ndddd\n', offset: 10, nextOffset: null })
		})

		it('returns an empty chunk past the end', () => {
			const file = logRun('one\n')

			expect(store.readArtifact(file, { offset: 999, limit: 100 })).toMatchObject({
				content: '',
				nextOffset: null,
			})
		})

		it('cuts an over-long line at the limit instead of returning nothing forever', () => {
			const file = logRun(`${'x'.repeat(50)}\n`)

			const chunk = store.readArtifact(file, { offset: 0, limit: 20 })

			expect(chunk.content).toBe('x'.repeat(20))
			expect(chunk.nextOffset).toBe(20)
		})

		it('redacts a secret that reached the file anyway, and a database URL', () => {
			const file = logRun(`key ${SECRET}\nurl postgresql://u:pw@localhost/db\n`)

			const { content } = store.readArtifact(file, { offset: 0, limit: 1000 })

			expect(content).not.toContain(SECRET)
			expect(content).not.toContain('pw@')
			expect(content).toContain('[REDACTED]')
			expect(content).toContain('[REDACTED_DATABASE_URL]')
		})

		it('streams a download with the same redaction and nothing else changed', async () => {
			const file = logRun(`first\nkey ${SECRET}\nlast`)

			const body = await text(store.openArtifact(file))

			expect(body).toBe('first\nkey [REDACTED]\nlast')
		})
	})
})
