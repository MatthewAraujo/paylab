import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runBenchmark } from '../../scripts/benchmark/executor'
import {
	evidenceScenario,
	fakeSuite,
	okScenario,
	requiresFileScenario,
} from '../support/benchmark-suite'
import { type TempRepo, createTempRepo } from '../support/git-repo'

describe('runBenchmark extensions used by the real suites', () => {
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

	describe('a scenario prepare hook (isolated reset before a mutating group)', () => {
		it('runs before that scenario starts and only for that scenario', async () => {
			const marker = join(repo.repoDir, 'marker.txt')
			const order: string[] = []
			const gated = {
				...requiresFileScenario('fake.gated', marker),
				prepare: async () => {
					order.push('prepare gated')
					writeFileSync(marker, 'ready')
				},
			}
			const suite = fakeSuite([okScenario('fake.plain'), gated])

			const { summary } = await runBenchmark({
				...options(),
				suite,
				onProgress: (p) => order.push(p.message),
			})

			expect(summary.status).toBe('COMPLETED')
			expect(order.indexOf('prepare gated')).toBeGreaterThan(order.indexOf('Completed fake.plain'))
			expect(order.indexOf('prepare gated')).toBeLessThan(order.indexOf('Completed fake.gated'))
		})

		it('fails that scenario, without starting it, when the reset fails', async () => {
			const gated = {
				...requiresFileScenario('fake.gated', join(repo.repoDir, 'never')),
				prepare: async () => {
					throw new Error('reset exploded')
				},
			}
			const suite = fakeSuite([okScenario('fake.a'), gated, okScenario('fake.c')])

			const { summary } = await runBenchmark({ ...options(), suite })

			expect(summary.status).toBe('INCOMPLETE')
			expect(summary.scenarios.map((s) => [s.id, s.status])).toEqual([
				['fake.a', 'COMPLETED'],
				['fake.gated', 'FAILED'],
				['fake.c', 'PENDING'],
			])
			expect(summary.failure?.scenarioId).toBe('fake.gated')
			expect(summary.failure?.summary).toContain('reset exploded')
			expect(summary.failure?.exitStatus).toBeUndefined()
		})
	})

	it('records the environment facts the preflight discovered', async () => {
		const suite = {
			...fakeSuite([okScenario('fake.a')]),
			prepare: async () => ({
				fingerprint: 'ds-1',
				environment: { postgres: 'PostgreSQL 16.3', shared_buffers: '1GB' },
			}),
		}

		const { summary } = await runBenchmark({ ...options(), suite })

		expect(summary.environment.details).toMatchObject({
			postgres: 'PostgreSQL 16.3',
			shared_buffers: '1GB',
			node: process.versions.node,
		})
		expect(summary.dataset.fingerprint).toBe('ds-1')
	})

	describe('extra evidence written by a scenario', () => {
		it('registers query plans and raw data as Artifacts, sanitized, next to the log', async () => {
			const suite = fakeSuite([
				evidenceScenario('fake.plan', {
					'first page.plan.txt':
						'Limit\nplan for postgresql://u:s3cretpw@localhost/db\nExecution Time: 1 ms',
					'raw.jsonl': '{"latencyMs":1.5}\n{"latencyMs":2.5}\n',
					'notes.bin': 'ignored',
				}),
			])

			const { summary } = await runBenchmark({ ...options(), suite })

			expect(summary.artifacts.map((a) => [a.id, a.kind, a.scenarioId])).toEqual([
				['fake.plan-log', 'LOG', 'fake.plan'],
				['fake.plan-first-page', 'QUERY_PLAN', 'fake.plan'],
				['fake.plan-raw', 'RAW_DATA', 'fake.plan'],
			])
			const dir = join(repo.artifactRoot, 'runs', summary.runId, 'artifacts')
			const plan = readFileSync(join(dir, 'fake.plan-first-page.plan.txt'), 'utf8')
			expect(plan).toContain('Execution Time: 1 ms')
			expect(plan).toContain('[REDACTED_DATABASE_URL]')
			expect(plan).not.toContain('s3cretpw')
			expect(readFileSync(join(dir, 'fake.plan-raw.jsonl'), 'utf8')).toContain('"latencyMs":2.5')
			expect(existsSync(join(dir, 'fake.plan-notes.bin'))).toBe(false)
			expect(existsSync(join(repo.artifactRoot, 'runs', summary.runId, 'incoming'))).toBe(false)
		})
	})
})
