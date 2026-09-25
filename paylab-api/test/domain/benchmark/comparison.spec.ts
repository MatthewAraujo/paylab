import { compareRuns, selectDefaultComparison } from '@/domain/benchmark/comparison'
import { type BenchmarkSummary, parseSummary } from '@/domain/benchmark/summary'
import { buildScenario, buildSummary } from '../../support/benchmark-fixtures'

function run(overrides: Record<string, unknown> = {}): BenchmarkSummary {
	const result = parseSummary(buildSummary(overrides))
	if (result.isLeft()) throw result.value
	return result.value
}

const failure = { summary: 'boom' }

const hot = buildScenario({ id: 'hot', fingerprint: 'fp-hot' })
const cold = buildScenario({ id: 'cold', fingerprint: 'fp-cold' })

function statesOf(current: BenchmarkSummary, reference: BenchmarkSummary) {
	const result = compareRuns(current, reference)
	if (result.isLeft()) throw new Error(result.value.message)
	return Object.fromEntries(result.value.scenarios.map((s) => [s.scenarioId, s.state]))
}

describe('compareRuns', () => {
	it('marks unchanged scenarios comparable', () => {
		const a = run({ scenarios: [hot, cold] })
		const b = run({ runId: 'run-b', scenarios: [hot, cold] })

		expect(statesOf(a, b)).toEqual({ hot: 'comparable', cold: 'comparable' })
	})

	it('labels a scenario only in the current Run as new and only in the reference as removed', () => {
		const current = run({ scenarios: [hot, cold] })
		const reference = run({ runId: 'run-b', scenarios: [hot, buildScenario({ id: 'gone' })] })

		expect(statesOf(current, reference)).toEqual({
			cold: 'new',
			gone: 'removed',
			hot: 'comparable',
		})
	})

	it('labels a scenario whose definition fingerprint differs as changed', () => {
		const current = run({ scenarios: [buildScenario({ id: 'hot', fingerprint: 'fp-hot-v2' })] })
		const reference = run({ runId: 'run-b', scenarios: [hot] })

		expect(statesOf(current, reference)).toEqual({ hot: 'changed' })
	})

	it('blocks scenarios present on both sides when the environment differs', () => {
		const current = run({
			scenarios: [hot, cold],
			environment: { fingerprint: 'env-2', details: {} },
		})
		const reference = run({ runId: 'run-b', scenarios: [hot] })

		expect(statesOf(current, reference)).toEqual({
			cold: 'new',
			hot: 'environment-incompatible',
		})
	})

	it('blocks scenarios when the dataset differs', () => {
		const current = run({ scenarios: [hot], dataset: { fingerprint: 'ds-2' } })
		const reference = run({ runId: 'run-b', scenarios: [hot] })

		expect(statesOf(current, reference)).toEqual({ hot: 'dataset-incompatible' })
	})

	it('reports scenarios ordered by identifier', () => {
		const result = compareRuns(
			run({ scenarios: [hot, cold] }),
			run({ runId: 'run-b', scenarios: [cold, hot] }),
		)

		expect(result.isRight() && result.value.scenarios.map((s) => s.scenarioId)).toEqual([
			'cold',
			'hot',
		])
	})

	it('refuses to compare an incomplete or running Run', () => {
		const complete = run()
		const incomplete = run({ runId: 'run-i', status: 'INCOMPLETE', failure })
		const running = run({
			runId: 'run-r',
			status: 'RUNNING',
			finishedAt: undefined,
			scenarios: [buildScenario({ status: 'ACTIVE', metrics: [] })],
		})

		expect(compareRuns(incomplete, complete).isLeft()).toBe(true)
		expect(compareRuns(complete, incomplete).isLeft()).toBe(true)
		expect(compareRuns(running, complete).isLeft()).toBe(true)
	})
})

describe('selectDefaultComparison', () => {
	const at = (n: number) => `2026-09-2${n}T10:00:00.000Z`
	const done = (id: string, day: number, extra: Record<string, unknown> = {}) =>
		run({
			runId: id,
			startedAt: at(day),
			finishedAt: `2026-09-2${day}T11:00:00.000Z`,
			scenarios: [hot],
			...extra,
		})

	it('pairs the newest completed Run with the previous compatible one', () => {
		const runs = [done('r1', 1), done('r3', 3), done('r2', 2)]

		const selection = selectDefaultComparison(runs)

		expect(selection?.current.runId).toBe('r3')
		expect(selection?.reference?.runId).toBe('r2')
	})

	it('ignores incomplete Runs, even newer ones', () => {
		const incomplete = done('r9', 9, { status: 'INCOMPLETE', failure })

		const selection = selectDefaultComparison([done('r1', 1), done('r2', 2), incomplete])

		expect(selection?.current.runId).toBe('r2')
		expect(selection?.reference?.runId).toBe('r1')
	})

	it('skips a previous Run from another environment', () => {
		const foreign = done('r2', 2, { environment: { fingerprint: 'env-x', details: {} } })

		const selection = selectDefaultComparison([done('r1', 1), foreign, done('r3', 3)])

		expect(selection?.current.runId).toBe('r3')
		expect(selection?.reference?.runId).toBe('r1')
	})

	it('has no reference when only one completed Run exists', () => {
		const selection = selectDefaultComparison([done('r1', 1)])

		expect(selection?.current.runId).toBe('r1')
		expect(selection?.reference).toBeNull()
	})

	it('selects nothing when no completed Run exists', () => {
		expect(selectDefaultComparison([])).toBeNull()
		expect(selectDefaultComparison([done('r1', 1, { status: 'INCOMPLETE', failure })])).toBeNull()
	})

	it('orders Runs that share a start time deterministically, by run id', () => {
		const same = (id: string) => done(id, 1, { startedAt: at(1) })

		const selection = selectDefaultComparison([same('r-a'), same('r-c'), same('r-b')])

		expect(selection?.current.runId).toBe('r-c')
		expect(selection?.reference?.runId).toBe('r-b')
	})
})
