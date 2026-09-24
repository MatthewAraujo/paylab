import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import { type BenchmarkFixture, buildBenchmarkApp } from '../support/benchmark-app'
import { buildMetric, buildScenario } from '../support/benchmark-fixtures'

const at = (day: number) => ({
	startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`,
	finishedAt: `2026-09-${String(day).padStart(2, '0')}T11:00:00.000Z`,
})

describe('Benchmark Baseline (E2E)', () => {
	let fixture: BenchmarkFixture
	const get = (path: string) => request(fixture.app.getHttpServer()).get(path)
	const select = (body: unknown) =>
		request(fixture.app.getHttpServer())
			.put('/v1/benchmarks/baseline')
			.send(body as object)
	const baselinePath = () => join(fixture.root, 'bench', 'baseline.json')
	const summaryBytes = (id: string) =>
		readFileSync(join(fixture.root, 'bench', 'results', `${id}.json`), 'utf8')

	beforeAll(async () => {
		fixture = await buildBenchmarkApp(true, { git: true })
		fixture.publish({
			runId: 'good',
			...at(20),
			scenarios: [buildScenario({ id: 'hot', metrics: [buildMetric({ value: 100 })] })],
		})
		fixture.publish({
			runId: 'good2',
			...at(21),
			scenarios: [buildScenario({ id: 'hot', metrics: [buildMetric({ value: 120 })] })],
		})
		fixture.publish({
			runId: 'imp',
			...at(19),
			finishedAt: undefined,
			kind: 'imported',
			imported: { source: 'docs/experiments/T13-results.md' },
		})
		fixture.publish({
			runId: 'bad',
			...at(22),
			status: 'INCOMPLETE',
			failure: { summary: 'boom' },
			scenarios: [buildScenario({ id: 'hot', status: 'FAILED', metrics: [] })],
		})
		fixture.running('live-1', { startedAt: at(23).startedAt })
		fixture.commit()
	})
	afterAll(async () => fixture?.close())

	it('has no Baseline until one is selected, and the worktree is clean', async () => {
		const response = await get('/v1/benchmarks/baseline')

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			baseline: null,
			run: null,
			git: { available: true, baselineChangePending: false, dirtyFiles: [], dirtyCount: 0 },
		})
	})

	it('selects a completed Run, discloses the pending Git change, and never commits it', async () => {
		const commits = fixture.git('rev-list', '--count', 'HEAD')
		const before = summaryBytes('good')

		const response = await select({ runId: 'good' })

		expect(response.statusCode).toBe(200)
		expect(response.body).toMatchObject({
			baseline: { runId: 'good', selectedAt: expect.any(String) },
			run: { runId: 'good', status: 'COMPLETED' },
			changed: true,
			git: {
				available: true,
				baselineChangePending: true,
				dirtyFiles: ['bench/baseline.json'],
				dirtyCount: 1,
			},
		})
		expect(fixture.git('rev-list', '--count', 'HEAD')).toBe(commits)
		expect(fixture.git('diff', '--cached', '--name-only')).toBe('')
		expect(summaryBytes('good')).toBe(before)
		expect((await get('/v1/benchmarks/baseline')).body.baseline.runId).toBe('good')
	})

	it('does not rewrite anything when the same Run is selected again', async () => {
		const before = readFileSync(baselinePath(), 'utf8')

		const response = await select({ runId: 'good' })

		expect(response.body.changed).toBe(false)
		expect(readFileSync(baselinePath(), 'utf8')).toBe(before)
	})

	it('is clear once the developer commits the change', async () => {
		fixture.commit()

		expect((await get('/v1/benchmarks/baseline')).body.git).toMatchObject({
			baselineChangePending: false,
			dirtyCount: 0,
		})
	})

	it('replaces the Baseline, and only the pointer changes', async () => {
		const good = summaryBytes('good')
		const good2 = summaryBytes('good2')

		const response = await select({ runId: 'good2' })

		expect(response.body).toMatchObject({ baseline: { runId: 'good2' }, changed: true })
		expect(response.body.git.dirtyFiles).toEqual(['bench/baseline.json'])
		expect(summaryBytes('good')).toBe(good)
		expect(summaryBytes('good2')).toBe(good2)
	})

	it('accepts an imported Run', async () => {
		const response = await select({ runId: 'imp' })

		expect(response.statusCode).toBe(200)
		expect(response.body.run).toMatchObject({ runId: 'imp', kind: 'imported' })
	})

	describe('candidates that cannot be a Baseline', () => {
		beforeAll(async () => {
			await select({ runId: 'good' })
		})

		it('rejects an incomplete Run, and one that is still running', async () => {
			for (const runId of ['bad', 'live-1']) {
				const response = await select({ runId })

				expect(response.statusCode, runId).toBe(422)
				expect(response.body).toMatchObject({ code: 'BENCHMARK_BASELINE_INELIGIBLE' })
			}
		})

		it('rejects an unknown Run', async () => {
			const response = await select({ runId: 'ghost' })

			expect(response.statusCode).toBe(404)
			expect(response.body).toMatchObject({ code: 'BENCHMARK_RUN_NOT_FOUND' })
		})

		it('rejects a malformed body, including a run id that could name a path', async () => {
			for (const body of [
				{},
				{ runId: '../etc/passwd' },
				{ runId: 'good', extra: 1 },
				{ runId: 5 },
			]) {
				expect((await select(body)).statusCode, JSON.stringify(body)).toBe(422)
			}
		})

		it('leaves the Baseline as it was after every rejection', async () => {
			expect((await get('/v1/benchmarks/baseline')).body.baseline.runId).toBe('good')
		})
	})

	it('shows the Baseline on a trend', async () => {
		const response = await get('/v1/benchmarks/trends?scenarioId=hot&metric=tps')

		expect(response.body.baselineRunId).toBe('good')
	})

	it('reports a Baseline whose Run is no longer published, and a damaged pointer', async () => {
		fixture.write(
			'bench/baseline.json',
			JSON.stringify({
				schemaVersion: 1,
				runId: 'vanished',
				selectedAt: '2026-09-24T09:00:00.000Z',
			}),
		)
		const missing = await get('/v1/benchmarks/baseline')
		fixture.write('bench/baseline.json', '{not json')
		const damaged = await get('/v1/benchmarks/baseline')

		expect(missing.body).toMatchObject({ baseline: { runId: 'vanished' }, run: null })
		expect(damaged.statusCode).toBe(200)
		expect(damaged.body).toMatchObject({ baseline: null, problem: expect.stringMatching(/JSON/) })
	})

	it('cannot be used when the capability is off', async () => {
		const off = await buildBenchmarkApp(false, { git: true })
		try {
			off.publish({ runId: 'good', ...at(20) })
			const put = await request(off.app.getHttpServer())
				.put('/v1/benchmarks/baseline')
				.send({ runId: 'good' })
			const read = await request(off.app.getHttpServer()).get('/v1/benchmarks/baseline')

			expect(put.statusCode).toBe(404)
			expect(read.statusCode).toBe(404)
			expect(off.git('status', '--porcelain', '--', 'bench/baseline.json')).toBe('')
		} finally {
			await off.close()
		}
	})
})
