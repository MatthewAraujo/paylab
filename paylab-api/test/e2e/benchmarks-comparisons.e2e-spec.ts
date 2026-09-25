import request from 'supertest'
import { type BenchmarkFixture, buildBenchmarkApp } from '../support/benchmark-app'
import { buildMetric, buildScenario } from '../support/benchmark-fixtures'

const at = (day: number) => ({
	startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`,
	finishedAt: `2026-09-${String(day).padStart(2, '0')}T11:00:00.000Z`,
})
const scenario = (id: string, value: number, fingerprint = `fp-${id}`) =>
	buildScenario({ id, fingerprint, metrics: [buildMetric({ value })] })

describe('Benchmark comparisons and trends (E2E)', () => {
	let fixture: BenchmarkFixture
	const get = (path: string) => request(fixture.app.getHttpServer()).get(path)

	beforeAll(async () => {
		fixture = await buildBenchmarkApp()
		fixture.publish({
			runId: 'A',
			...at(20),
			scenarios: [scenario('hot', 100), scenario('cold', 10)],
		})
		fixture.publish({
			runId: 'B',
			...at(21),
			scenarios: [scenario('hot', 120), scenario('cold', 11), scenario('extra', 5)],
		})
		fixture.publish({
			runId: 'C',
			...at(22),
			environment: { fingerprint: 'env-2', details: {} },
			scenarios: [scenario('hot', 130), scenario('cold', 12)],
		})
		fixture.publish({
			runId: 'D',
			...at(23),
			status: 'INCOMPLETE',
			failure: { summary: 'boom' },
			scenarios: [scenario('hot', 999)],
		})
		fixture.publish({
			runId: 'E',
			...at(24),
			scenarios: [scenario('hot', 150), scenario('cold', 13, 'fp-cold-v2')],
		})
	})
	afterAll(async () => fixture?.close())

	describe('default comparison', () => {
		it('pairs the newest completed Run with the previous compatible one, per scenario', async () => {
			const response = await get('/v1/benchmarks/comparisons/default')

			expect(response.statusCode).toBe(200)
			expect(response.body.current.runId).toBe('E')
			expect(response.body.reference.runId).toBe('B')
			expect(response.body.comparison).toEqual({
				environmentCompatible: true,
				datasetCompatible: true,
				scenarios: [
					{ scenarioId: 'cold', state: 'changed' },
					{ scenarioId: 'extra', state: 'removed' },
					{ scenarioId: 'hot', state: 'comparable' },
				],
			})
		})

		it('skips incomplete Runs and Runs from another environment', async () => {
			// D is incomplete and C ran elsewhere: neither can be the reference for E.
			const response = await get('/v1/benchmarks/comparisons/default')

			expect(['C', 'D']).not.toContain(response.body.reference.runId)
		})

		it('has no reference with a single completed Run, and nothing without one', async () => {
			const single = await buildBenchmarkApp()
			single.publish({ runId: 'only', ...at(20) })
			const none = await buildBenchmarkApp()

			try {
				const one = await request(single.app.getHttpServer()).get(
					'/v1/benchmarks/comparisons/default',
				)
				const zero = await request(none.app.getHttpServer()).get(
					'/v1/benchmarks/comparisons/default',
				)

				expect(one.body).toMatchObject({
					current: { runId: 'only' },
					reference: null,
					comparison: null,
				})
				expect(zero.body).toEqual({ current: null, reference: null, comparison: null })
			} finally {
				await single.close()
				await none.close()
			}
		})
	})

	describe('chosen comparison', () => {
		it('compares any two completed Runs and labels new, removed, changed, and comparable scenarios', async () => {
			const response = await get('/v1/benchmarks/comparisons?current=E&reference=A')

			expect(response.statusCode).toBe(200)
			expect(response.body.comparison.scenarios).toEqual([
				{ scenarioId: 'cold', state: 'changed' },
				{ scenarioId: 'hot', state: 'comparable' },
			])
		})

		it('blocks the scenarios of a Run from another environment instead of comparing them', async () => {
			const response = await get('/v1/benchmarks/comparisons?current=E&reference=C')

			expect(response.body.comparison).toMatchObject({ environmentCompatible: false })
			expect(response.body.comparison.scenarios.map((s: any) => s.state)).toEqual([
				'environment-incompatible',
				'environment-incompatible',
			])
		})

		it('refuses an incomplete Run, with a reason, and reports unknown Runs', async () => {
			const incomplete = await get('/v1/benchmarks/comparisons?current=D&reference=A')
			const unknown = await get('/v1/benchmarks/comparisons?current=E&reference=nope')
			const missing = await get('/v1/benchmarks/comparisons?current=E')

			expect(incomplete.statusCode).toBe(422)
			expect(incomplete.body).toMatchObject({ code: 'BENCHMARK_RUN_NOT_COMPARABLE' })
			expect(unknown.statusCode).toBe(404)
			expect(missing.statusCode).toBe(422)
		})
	})

	describe('trends', () => {
		const trend = (query: string) => get(`/v1/benchmarks/trends?${query}`)

		it('draws compatible completed measurements in order, and marks incomplete Runs without values', async () => {
			const response = await trend('scenarioId=hot&metric=tps')

			expect(response.statusCode).toBe(200)
			expect(response.body.points.map((p: any) => [p.runId, p.value])).toEqual([
				['A', 100],
				['B', 120],
				['E', 150],
			])
			expect(response.body.excluded).toEqual([
				{ runId: 'C', startedAt: '2026-09-22T10:00:00.000Z', reason: 'environment-incompatible' },
			])
			expect(response.body.incompleteRuns).toEqual([
				{ runId: 'D', startedAt: '2026-09-23T10:00:00.000Z', failureSummary: 'boom' },
			])
			expect(response.body).toMatchObject({
				reference: { runId: 'E' },
				unit: 'tx/s',
				direction: 'HIGHER_IS_BETTER',
			})
		})

		it('never joins a changed scenario definition into the line', async () => {
			const response = await trend('scenarioId=cold&metric=tps')

			expect(response.body.points.map((p: any) => p.runId)).toEqual(['E'])
			expect(response.body.excluded.map((e: any) => [e.runId, e.reason])).toEqual([
				['A', 'changed'],
				['B', 'changed'],
				['C', 'environment-incompatible'],
			])
		})

		it('has an empty series for an unknown scenario', async () => {
			const response = await trend('scenarioId=nope&metric=tps')

			expect(response.body).toMatchObject({ reference: null, points: [], excluded: [] })
		})

		it('selects a metric by dimension', async () => {
			const response = await trend('scenarioId=hot&metric=tps&dimension=strategy:nokey')

			expect(response.statusCode).toBe(200)
			expect(response.body.dimensions).toEqual({ strategy: 'nokey' })
			expect(response.body.points).toEqual([])
		})

		it('rejects a missing scenario or metric and a malformed dimension', async () => {
			for (const query of [
				'metric=tps',
				'scenarioId=hot',
				'scenarioId=hot&metric=tps&dimension=nocolon',
				'scenarioId=../x&metric=tps',
			]) {
				expect((await trend(query)).statusCode, query).toBe(422)
			}
		})
	})
})
