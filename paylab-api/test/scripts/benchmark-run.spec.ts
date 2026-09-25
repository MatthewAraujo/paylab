import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serializeSummary } from '@/domain/benchmark/serialize'
import { parseSummary } from '@/domain/benchmark/summary'
import { runBenchmark } from '../../scripts/benchmark/executor'
import { DirtyWorktreeError } from '../../scripts/benchmark/git'
import {
	failingScenario,
	fakeSuite,
	hangingScenario,
	leakyScenario,
	okScenario,
	silentScenario,
} from '../support/benchmark-suite'
import { type TempRepo, createTempRepo } from '../support/git-repo'

describe('runBenchmark', () => {
	let repo: TempRepo

	beforeEach(() => {
		repo = createTempRepo()
	})
	afterEach(() => repo.cleanup())

	const options = () => ({
		repoDir: repo.repoDir,
		artifactRoot: repo.artifactRoot,
		summaryDir: repo.summaryDir,
		executorVersion: 'test',
	})

	describe('a full suite that succeeds', () => {
		it('publishes an immutable COMPLETED Summary with provenance and normalized metrics', async () => {
			const suite = fakeSuite([okScenario('fake.a', 100), okScenario('fake.b', 250)])

			const result = await runBenchmark({ ...options(), suite, note: 'after the index change' })

			const { summary } = result
			expect(summary.status).toBe('COMPLETED')
			expect(summary.kind).toBe('native')
			expect(summary.note).toBe('after the index change')
			expect(summary.source).toEqual({ commit: repo.git('rev-parse', 'HEAD'), branch: 'main' })
			expect(summary.runId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-[0-9a-f]{7}$/)
			expect(summary.dataset.fingerprint).toBe('ds-fake-1')
			expect(summary.executor.version).toBe('test')
			expect(summary.scenarios.map((s) => [s.id, s.status, s.metrics[0].value])).toEqual([
				['fake.a', 'COMPLETED', 100],
				['fake.b', 'COMPLETED', 250],
			])

			const file = join(repo.summaryDir, `${summary.runId}.json`)
			const onDisk = readFileSync(file, 'utf8')
			const parsed = parseSummary(JSON.parse(onDisk))
			expect(parsed.isRight()).toBe(true)
			expect(onDisk).toBe(serializeSummary(summary))
		})

		it('keeps each scenario log as a local Artifact and references it from the Summary', async () => {
			const result = await runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) })

			const [artifact] = result.summary.artifacts
			expect(artifact).toMatchObject({ kind: 'LOG', scenarioId: 'fake.a' })
			const log = readFileSync(
				join(repo.artifactRoot, 'runs', result.summary.runId, 'artifacts', `${artifact.id}.log`),
				'utf8',
			)
			expect(log).toContain('working on fake.a')
		})

		it('does not leak the process environment into the Summary', async () => {
			process.env.BENCH_TEST_LEAK_CANARY = 'canary-value-1234'
			try {
				const result = await runBenchmark({
					...options(),
					suite: fakeSuite([okScenario('fake.a')]),
				})

				expect(JSON.stringify(result.summary)).not.toContain('canary-value-1234')
				expect(result.summary.environment.fingerprint.length).toBeGreaterThan(0)
				expect(result.summary.environment.details.node).toBe(process.versions.node)
			} finally {
				Reflect.deleteProperty(process.env, 'BENCH_TEST_LEAK_CANARY')
			}
		})

		it('exposes RUNNING progress on disk before and during the suite, then removes it', async () => {
			const seen: string[] = []
			const suite = fakeSuite([okScenario('fake.a'), okScenario('fake.b')])

			const result = await runBenchmark({
				...options(),
				suite,
				onProgress: (progress) => {
					const statePath = join(repo.artifactRoot, 'runs', progress.runId, 'state.json')
					const state = parseSummary(JSON.parse(readFileSync(statePath, 'utf8')))
					if (state.isLeft()) throw state.value
					seen.push(
						`${state.value.status}:${state.value.scenarios.map((s) => s.status[0]).join('')}`,
					)
				},
			})

			expect(seen[0]).toBe('RUNNING:PP')
			expect(seen).toContain('RUNNING:AP')
			expect(seen).toContain('RUNNING:CA')
			expect(existsSync(join(repo.artifactRoot, 'runs', result.summary.runId, 'state.json'))).toBe(
				false,
			)
		})

		it('never commits: it reports the generated file and a suggested commit message', async () => {
			const before = repo.git('rev-list', '--count', 'HEAD')

			const result = await runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) })

			expect(repo.git('rev-list', '--count', 'HEAD')).toBe(before)
			expect(result.files).toEqual([`bench/results/${result.summary.runId}.json`])
			expect(result.suggestedCommitMessage).toContain(result.summary.runId)
			expect(repo.git('status', '--porcelain', '--untracked-files=all')).toContain(
				`bench/results/${result.summary.runId}.json`,
			)
		})
	})

	describe('a suite that does not finish', () => {
		it('publishes an INCOMPLETE Summary that keeps completed measurements and skips the rest', async () => {
			const suite = fakeSuite([
				okScenario('fake.a', 100),
				failingScenario('fake.b', 'boom: invariant violated', 3),
				okScenario('fake.c', 300),
			])

			const { summary } = await runBenchmark({ ...options(), suite })

			expect(summary.status).toBe('INCOMPLETE')
			expect(summary.scenarios.map((s) => [s.id, s.status, s.metrics.length])).toEqual([
				['fake.a', 'COMPLETED', 1],
				['fake.b', 'FAILED', 0],
				['fake.c', 'PENDING', 0],
			])
			expect(summary.failure).toMatchObject({ scenarioId: 'fake.b', exitStatus: 3 })
			expect(summary.failure?.summary).toContain('boom: invariant violated')
			expect(summary.failure?.command).toContain(process.execPath)
			expect(existsSync(join(repo.summaryDir, `${summary.runId}.json`))).toBe(true)
			expect(existsSync(join(repo.artifactRoot, 'runs', summary.runId, 'state.json'))).toBe(false)
		})

		it('keeps the failing scenario log as evidence and records its timing', async () => {
			let tick = 0
			const now = () => new Date(Date.UTC(2026, 8, 24, 10, 0, tick++))
			const suite = fakeSuite([failingScenario('fake.b', 'boom', 1)])

			const { summary } = await runBenchmark({ ...options(), suite, now })

			const failed = summary.scenarios[0]
			expect(failed.startedAt).toBeDefined()
			expect(failed.finishedAt).toBeDefined()
			expect(failed.durationMs).toBe(1000)
			const artifact = summary.artifacts.find((a) => a.scenarioId === 'fake.b')
			expect(artifact).toBeDefined()
			const log = readFileSync(
				join(repo.artifactRoot, 'runs', summary.runId, 'artifacts', `${artifact?.id}.log`),
				'utf8',
			)
			expect(log).toContain('boom')
		})

		it('treats a scenario that exits cleanly without a result as failed', async () => {
			const { summary } = await runBenchmark({
				...options(),
				suite: fakeSuite([silentScenario('fake.a')]),
			})

			expect(summary.status).toBe('INCOMPLETE')
			expect(summary.scenarios[0].status).toBe('FAILED')
			expect(summary.failure?.summary).toContain('no result')
		})

		it('publishes INCOMPLETE without starting any scenario when preparation fails', async () => {
			const suite = {
				...fakeSuite([okScenario('fake.a')]),
				prepare: async () => {
					throw new Error('docker is not running')
				},
			}

			const { summary } = await runBenchmark({ ...options(), suite })

			expect(summary.status).toBe('INCOMPLETE')
			expect(summary.scenarios.map((s) => s.status)).toEqual(['PENDING'])
			expect(summary.failure?.summary).toContain('docker is not running')
		})
	})

	describe('starting a Run', () => {
		it('rejects a dirty worktree before creating any Run', async () => {
			repo.write('README.md', 'edited\n')

			await expect(
				runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) }),
			).rejects.toThrow(DirtyWorktreeError)

			expect(existsSync(repo.summaryDir)).toBe(false)
			expect(existsSync(join(repo.artifactRoot, 'runs'))).toBe(false)
		})

		it('blocks the next Run while the generated Summary is uncommitted, and allows it once committed', async () => {
			const suite = fakeSuite([okScenario('fake.a')])
			const first = await runBenchmark({ ...options(), suite })

			await expect(runBenchmark({ ...options(), suite })).rejects.toThrow(
				new RegExp(`bench/results/${first.summary.runId}\\.json`),
			)

			repo.git('add', '-A')
			repo.git('commit', '-q', '-m', 'publish run')
			const second = await runBenchmark({ ...options(), suite })
			expect(second.summary.runId).not.toBe(first.summary.runId)
		})

		it('rejects a scenario id that is not safe as a file name', async () => {
			const unsafe = okScenario('../escape')

			await expect(runBenchmark({ ...options(), suite: fakeSuite([unsafe]) })).rejects.toThrow(
				/scenario id/i,
			)
			expect(existsSync(repo.summaryDir)).toBe(false)
		})
	})

	describe('an interrupted Run', () => {
		it('stops the running scenario and publishes INCOMPLETE with the earlier measurements', async () => {
			const controller = new AbortController()
			const suite = fakeSuite([
				okScenario('fake.a', 100),
				hangingScenario('fake.hang'),
				okScenario('fake.c'),
			])

			const started = Date.now()
			const { summary } = await runBenchmark({
				...options(),
				suite,
				signal: controller.signal,
				onProgress: (progress) => {
					if (progress.message === 'Running fake.hang') {
						setTimeout(() => controller.abort(), 200)
					}
				},
			})

			expect(Date.now() - started).toBeLessThan(10_000)
			expect(summary.status).toBe('INCOMPLETE')
			expect(summary.scenarios.map((s) => [s.id, s.status])).toEqual([
				['fake.a', 'COMPLETED'],
				['fake.hang', 'FAILED'],
				['fake.c', 'PENDING'],
			])
			expect(summary.failure).toMatchObject({ scenarioId: 'fake.hang' })
			expect(summary.failure?.summary).toMatch(/interrupted/i)
			expect(existsSync(join(repo.artifactRoot, 'lock.json'))).toBe(false)
		})
	})

	describe('sensitive output', () => {
		it('never reaches the stored log, the failure evidence, or the versioned Summary', async () => {
			const secret = 'hunter2-private-value'
			const suite = fakeSuite([leakyScenario('fake.leak', secret)])

			const { summary } = await runBenchmark({ ...options(), suite, secrets: [secret] })

			const artifactId = summary.artifacts[0].id
			const log = readFileSync(
				join(repo.artifactRoot, 'runs', summary.runId, 'artifacts', `${artifactId}.log`),
				'utf8',
			)
			const published = readFileSync(join(repo.summaryDir, `${summary.runId}.json`), 'utf8')

			for (const text of [log, published]) {
				expect(text).not.toContain(secret)
				expect(text).not.toContain('s3cretpw')
			}
			expect(log).toContain('[REDACTED_DATABASE_URL]')
			expect(summary.failure?.summary).toContain('[REDACTED]')
		})
	})
})
