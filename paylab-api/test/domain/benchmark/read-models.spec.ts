import { buildTrend, toProgress, toRunListItem } from '@/domain/benchmark/read-models'
import { type BenchmarkSummary, parseSummary } from '@/domain/benchmark/summary'
import { buildMetric, buildScenario, buildSummary } from '../../support/benchmark-fixtures'

function run(overrides: Record<string, unknown> = {}): BenchmarkSummary {
	const result = parseSummary(buildSummary(overrides))
	if (result.isLeft()) throw result.value
	return result.value
}

const scenario = (id: string, value: number, extra: Record<string, unknown> = {}) =>
	buildScenario({
		id,
		fingerprint: `fp-${id}`,
		metrics: [
			buildMetric({ value }),
			buildMetric({ key: 'p99', direction: 'LOWER_IS_BETTER', value: 9 }),
		],
		...extra,
	})

describe('toRunListItem', () => {
	it('is a light view: provenance, counts, failure, and only the headline metrics', () => {
		const featured = buildMetric({ summaryRole: 'THROUGHPUT', value: 250 })
		const other = buildMetric({ key: 'errors', value: 0 })
		const summary = run({
			scenarios: [
				buildScenario({ id: 'a', metrics: [featured, other] }),
				buildScenario({ id: 'b', status: 'FAILED', metrics: [] }),
			],
			status: 'INCOMPLETE',
			failure: { scenarioId: 'b', summary: 'boom' },
		})

		const item = toRunListItem(summary)

		expect(item).toMatchObject({
			runId: summary.runId,
			kind: 'native',
			status: 'INCOMPLETE',
			source: { commit: 'abc1234def5678', branch: 'main' },
			environmentFingerprint: 'env-1',
			dataset: { fingerprint: 'ds-1' },
			scenarioCounts: { total: 2, completed: 1, failed: 1, pending: 0, active: 0 },
			failure: { scenarioId: 'b', summary: 'boom' },
		})
		expect(item.headlineMetrics).toEqual([
			{
				scenarioId: 'a',
				key: 'tps',
				label: 'Throughput',
				unit: 'tx/s',
				value: 250,
				summaryRole: 'THROUGHPUT',
			},
		])
		expect(JSON.stringify(item)).not.toContain('"scenarios"')
	})

	it('carries the strategy dimension of a headline metric', () => {
		const featured = buildMetric({ summaryRole: 'THROUGHPUT', dimensions: { strategy: 'nokey' } })
		const item = toRunListItem(run({ scenarios: [buildScenario({ metrics: [featured] })] }))

		expect(item.headlineMetrics[0].dimensions).toEqual({ strategy: 'nokey' })
	})
})

describe('toProgress', () => {
	it('reports each scenario status and the one that is running now', () => {
		const running = run({
			status: 'RUNNING',
			finishedAt: undefined,
			durationMs: undefined,
			scenarios: [
				buildScenario({ id: 'a', status: 'COMPLETED' }),
				buildScenario({
					id: 'b',
					status: 'ACTIVE',
					startedAt: '2026-09-23T10:05:00.000Z',
					metrics: [],
				}),
				buildScenario({ id: 'c', status: 'PENDING', metrics: [] }),
			],
		})

		expect(toProgress(running)).toMatchObject({
			status: 'RUNNING',
			current: 'b',
			completed: 1,
			total: 3,
			scenarios: [
				{ id: 'a', status: 'COMPLETED' },
				{ id: 'b', status: 'ACTIVE', startedAt: '2026-09-23T10:05:00.000Z' },
				{ id: 'c', status: 'PENDING' },
			],
		})
	})

	it('has nothing running once the Run is terminal', () => {
		expect(toProgress(run()).current).toBeNull()
	})
})

describe('buildTrend', () => {
	const at = (day: number) => ({
		startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`,
		finishedAt: `2026-09-${String(day).padStart(2, '0')}T11:00:00.000Z`,
	})
	const query = { scenarioId: 'hot', metricKey: 'tps', dimensions: {} }

	it('lists compatible completed measurements in chronological order', () => {
		const runs = [
			run({ runId: 'r3', ...at(3), scenarios: [scenario('hot', 300)] }),
			run({ runId: 'r1', ...at(1), scenarios: [scenario('hot', 100)] }),
			run({ runId: 'r2', ...at(2), scenarios: [scenario('hot', 200)] }),
		]

		const trend = buildTrend(runs, query)

		expect(trend.points.map((p) => [p.runId, p.value])).toEqual([
			['r1', 100],
			['r2', 200],
			['r3', 300],
		])
		expect(trend.reference?.runId).toBe('r3')
		expect(trend).toMatchObject({
			unit: 'tx/s',
			direction: 'HIGHER_IS_BETTER',
			label: 'Throughput',
		})
	})

	it('excludes, with the reason, what is not comparable with the newest measurement', () => {
		const runs = [
			run({ runId: 'r1', ...at(1), scenarios: [scenario('hot', 100)] }),
			run({
				runId: 'changed',
				...at(2),
				scenarios: [scenario('hot', 150, { fingerprint: 'fp-other' })],
			}),
			run({
				runId: 'foreign',
				...at(3),
				environment: { fingerprint: 'env-2', details: {} },
				scenarios: [scenario('hot', 160)],
			}),
			run({
				runId: 'dataset',
				...at(4),
				dataset: { fingerprint: 'ds-2' },
				scenarios: [scenario('hot', 170)],
			}),
			run({ runId: 'r5', ...at(5), scenarios: [scenario('hot', 500)] }),
		]

		const trend = buildTrend(runs, query)

		expect(trend.points.map((p) => p.runId)).toEqual(['r1', 'r5'])
		expect(trend.excluded.map((e) => [e.runId, e.reason])).toEqual([
			['changed', 'changed'],
			['foreign', 'environment-incompatible'],
			['dataset', 'dataset-incompatible'],
		])
	})

	it('shows incomplete Runs as timeline markers without any value', () => {
		const runs = [
			run({ runId: 'r1', ...at(1), scenarios: [scenario('hot', 100)] }),
			run({
				runId: 'bad',
				...at(2),
				status: 'INCOMPLETE',
				failure: { summary: 'boom' },
				scenarios: [scenario('hot', 999)],
			}),
			run({ runId: 'r3', ...at(3), scenarios: [scenario('hot', 300)] }),
		]

		const trend = buildTrend(runs, query)

		expect(trend.points.map((p) => p.runId)).toEqual(['r1', 'r3'])
		expect(trend.incompleteRuns).toEqual([
			{ runId: 'bad', startedAt: '2026-09-02T10:00:00.000Z', failureSummary: 'boom' },
		])
	})

	it('picks the metric by key and by dimensions', () => {
		const withStrategies = (nokey: number, advisory: number) =>
			buildScenario({
				id: 'hot',
				fingerprint: 'fp-hot',
				metrics: [
					buildMetric({ value: nokey, dimensions: { strategy: 'nokey' } }),
					buildMetric({ value: advisory, dimensions: { strategy: 'advisory' } }),
				],
			})
		const runs = [
			run({ runId: 'r1', ...at(1), scenarios: [withStrategies(10, 11)] }),
			run({ runId: 'r2', ...at(2), scenarios: [withStrategies(20, 21)] }),
		]

		const trend = buildTrend(runs, { ...query, dimensions: { strategy: 'advisory' } })

		expect(trend.points.map((p) => p.value)).toEqual([11, 21])
	})

	it('excludes a Run whose scenario did not record that metric, and knows no series for an unknown scenario', () => {
		const runs = [
			run({
				runId: 'r1',
				...at(1),
				scenarios: [buildScenario({ id: 'hot', fingerprint: 'fp-hot', metrics: [] })],
			}),
			run({ runId: 'r2', ...at(2), scenarios: [scenario('hot', 200)] }),
		]

		const trend = buildTrend(runs, query)

		expect(trend.points.map((p) => p.runId)).toEqual(['r2'])
		expect(trend.excluded).toEqual([
			{ runId: 'r1', startedAt: '2026-09-01T10:00:00.000Z', reason: 'metric-not-recorded' },
		])
		expect(buildTrend(runs, { ...query, scenarioId: 'nope' })).toMatchObject({
			reference: null,
			points: [],
			excluded: [],
		})
	})
})
