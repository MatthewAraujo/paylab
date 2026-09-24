import { isBaselineEligible, parseBaseline } from '@/domain/benchmark/baseline'
import { parseSummary } from '@/domain/benchmark/summary'
import { buildScenario, buildSummary } from '../../support/benchmark-fixtures'

function run(overrides: Record<string, unknown> = {}) {
	const result = parseSummary(buildSummary(overrides))
	if (result.isLeft()) throw result.value
	return result.value
}

describe('parseBaseline', () => {
	it('accepts a small versioned reference to a Run', () => {
		const result = parseBaseline({
			schemaVersion: 1,
			runId: '2026-09-23T10-00-00Z-abc1234',
			selectedAt: '2026-09-24T09:00:00.000Z',
		})

		expect(result.isRight() && result.value.runId).toBe('2026-09-23T10-00-00Z-abc1234')
	})

	it('rejects an unknown version and an unsafe run identifier', () => {
		const valid = { schemaVersion: 1, runId: 'r1', selectedAt: '2026-09-24T09:00:00.000Z' }

		expect(parseBaseline({ ...valid, schemaVersion: 2 }).isLeft()).toBe(true)
		expect(parseBaseline({ ...valid, runId: '../r1' }).isLeft()).toBe(true)
	})
})

describe('isBaselineEligible', () => {
	it('accepts completed native and imported Runs', () => {
		const imported = run({
			kind: 'imported',
			imported: { source: 'docs/experiments/T13-results.md' },
		})

		expect(isBaselineEligible(run())).toBe(true)
		expect(isBaselineEligible(imported)).toBe(true)
	})

	it('rejects incomplete and running Runs', () => {
		const incomplete = run({ status: 'INCOMPLETE', failure: { summary: 'boom' } })
		const running = run({
			status: 'RUNNING',
			finishedAt: undefined,
			scenarios: [buildScenario({ status: 'ACTIVE', metrics: [] })],
		})

		expect(isBaselineEligible(incomplete)).toBe(false)
		expect(isBaselineEligible(running)).toBe(false)
	})
})
