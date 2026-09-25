import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSummary } from '@/domain/benchmark/summary'
import { runBenchmark } from '../../scripts/benchmark/executor'
import { DirtyWorktreeError } from '../../scripts/benchmark/git'
import { ActiveRunError } from '../../scripts/benchmark/lock'
import { buildMetric, buildScenario, buildSummary } from '../support/benchmark-fixtures'
import { failingScenario, fakeSuite, okScenario, slowScenario } from '../support/benchmark-suite'
import { type TempRepo, createTempRepo } from '../support/git-repo'

describe('exclusive execution and recovery', () => {
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
	const lockPath = () => join(repo.artifactRoot, 'lock.json')

	function abandonedRun(runId: string, pid: number) {
		const state = buildSummary({
			runId,
			status: 'RUNNING',
			finishedAt: undefined,
			durationMs: undefined,
			scenarios: [
				buildScenario({ id: 'fake.a', metrics: [buildMetric({ value: 777 })] }),
				buildScenario({ id: 'fake.b', fingerprint: 'fp-b', status: 'ACTIVE', metrics: [] }),
			],
		})
		mkdirSync(join(repo.artifactRoot, 'runs', runId), { recursive: true })
		writeFileSync(join(repo.artifactRoot, 'runs', runId, 'state.json'), JSON.stringify(state))
		writeFileSync(lockPath(), JSON.stringify({ pid, runId, startedAt: '2026-09-24T09:00:00.000Z' }))
	}

	function deadPid(): number {
		const finished = spawnSync(process.execPath, ['-e', ''])
		return finished.pid
	}

	it('reports the active Run and its stage to a second invocation, then lets the first finish', async () => {
		let activeRunId = ''
		let second: Promise<unknown> = Promise.reject(new Error('the first Run never started'))
		second.catch(() => {})

		const first = runBenchmark({
			...options(),
			suite: fakeSuite([slowScenario('fake.slow', 700)]),
			onProgress: (progress) => {
				if (progress.message === 'Running fake.slow') {
					activeRunId = progress.runId
					second = runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.x')]) }).then(
						() => null,
						(error) => error,
					)
				}
			},
		})

		const result = await first
		const rejection = await second

		expect(rejection).toBeInstanceOf(ActiveRunError)
		expect((rejection as ActiveRunError).message).toContain(activeRunId)
		expect((rejection as ActiveRunError).message).toContain('fake.slow')
		expect(result.summary.status).toBe('COMPLETED')
	})

	it('leaves the active owner’s lock untouched when it refuses', async () => {
		abandonedRun('r-live', process.pid)

		await expect(
			runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) }),
		).rejects.toThrow(ActiveRunError)

		expect(existsSync(lockPath())).toBe(true)
		expect(existsSync(join(repo.artifactRoot, 'runs', 'r-live', 'state.json'))).toBe(true)
	})

	it('recovers an abandoned RUNNING Run as INCOMPLETE, keeping completed measurements', async () => {
		abandonedRun('r-stale-1', deadPid())

		await expect(
			runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) }),
		).rejects.toThrow(DirtyWorktreeError)

		const recovered = parseSummary(
			JSON.parse(readFileSync(join(repo.summaryDir, 'r-stale-1.json'), 'utf8')),
		)
		if (recovered.isLeft()) throw recovered.value
		const summary = recovered.value
		expect(summary.status).toBe('INCOMPLETE')
		expect(summary.failure?.summary).toMatch(/interrupted/i)
		expect(summary.failure?.scenarioId).toBe('fake.b')
		expect(summary.scenarios.map((s) => [s.id, s.status])).toEqual([
			['fake.a', 'COMPLETED'],
			['fake.b', 'FAILED'],
		])
		expect(summary.scenarios[0].metrics[0].value).toBe(777)
		expect(existsSync(join(repo.artifactRoot, 'runs', 'r-stale-1', 'state.json'))).toBe(false)
		expect(existsSync(lockPath())).toBe(false)
	})

	it('runs normally once the recovered Summary has been committed', async () => {
		abandonedRun('r-stale-2', deadPid())
		await expect(
			runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) }),
		).rejects.toThrow(DirtyWorktreeError)

		repo.git('add', '-A')
		repo.git('commit', '-q', '-m', 'publish recovered run')

		const result = await runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) })
		expect(result.summary.status).toBe('COMPLETED')
	})

	it('clears a stale lock that has no Run state', async () => {
		mkdirSync(repo.artifactRoot, { recursive: true })
		writeFileSync(
			lockPath(),
			JSON.stringify({ pid: deadPid(), startedAt: '2026-09-24T09:00:00.000Z' }),
		)

		const result = await runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) })

		expect(result.summary.status).toBe('COMPLETED')
	})

	it('releases the lock after a completed, an incomplete, and a rejected invocation', async () => {
		await runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) })
		expect(existsSync(lockPath())).toBe(false)

		repo.git('add', '-A')
		repo.git('commit', '-q', '-m', 'publish')
		await runBenchmark({ ...options(), suite: fakeSuite([failingScenario('fake.b', 'boom')]) })
		expect(existsSync(lockPath())).toBe(false)

		await expect(
			runBenchmark({ ...options(), suite: fakeSuite([okScenario('fake.a')]) }),
		).rejects.toThrow(DirtyWorktreeError)
		expect(existsSync(lockPath())).toBe(false)
	})
})
