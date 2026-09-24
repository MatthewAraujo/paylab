import { canTransition } from '@/domain/benchmark/lifecycle'
import { parseSummary } from '@/domain/benchmark/summary'
import { buildScenario, buildSummary } from '../../support/benchmark-fixtures'

const failure = { scenarioId: 't14.settle.hot', summary: 'invariant violated', exitStatus: 1 }

describe('Summary lifecycle rules', () => {
	it('accepts a running Summary that has not finished', () => {
		const running = buildSummary({
			status: 'RUNNING',
			finishedAt: undefined,
			durationMs: undefined,
			scenarios: [buildScenario({ status: 'ACTIVE', metrics: [] })],
		})

		expect(parseSummary(running).isRight()).toBe(true)
	})

	it('rejects a running Summary that already has a finish time', () => {
		expect(parseSummary(buildSummary({ status: 'RUNNING' })).isLeft()).toBe(true)
	})

	it('rejects a terminal Summary without a finish time', () => {
		expect(parseSummary(buildSummary({ finishedAt: undefined })).isLeft()).toBe(true)
	})

	it('rejects a completed Summary that still has an unfinished scenario', () => {
		const scenarios = [buildScenario({ status: 'FAILED' })]

		expect(parseSummary(buildSummary({ scenarios })).isLeft()).toBe(true)
	})

	it('accepts an incomplete Summary that keeps completed measurements and failure evidence', () => {
		const scenarios = [
			buildScenario(),
			buildScenario({ id: 't14.settle.cold', fingerprint: 'fp-2', status: 'FAILED', metrics: [] }),
		]

		expect(parseSummary(buildSummary({ status: 'INCOMPLETE', scenarios, failure })).isRight()).toBe(
			true,
		)
	})

	it('rejects an incomplete Summary without failure evidence', () => {
		expect(parseSummary(buildSummary({ status: 'INCOMPLETE' })).isLeft()).toBe(true)
	})

	it('requires imported provenance on imported Summaries only', () => {
		const imported = { kind: 'imported', imported: { source: 'docs/experiments/T14-results.md' } }

		expect(parseSummary(buildSummary(imported)).isRight()).toBe(true)
		expect(parseSummary(buildSummary({ kind: 'imported' })).isLeft()).toBe(true)
		expect(
			parseSummary(
				buildSummary({ imported: { source: 'docs/experiments/T14-results.md' } }),
			).isLeft(),
		).toBe(true)
	})
})

describe('canTransition', () => {
	it('lets a running Run finish either way', () => {
		expect(canTransition('RUNNING', 'COMPLETED')).toBe(true)
		expect(canTransition('RUNNING', 'INCOMPLETE')).toBe(true)
	})

	it('never changes a terminal Run', () => {
		for (const from of ['COMPLETED', 'INCOMPLETE'] as const) {
			for (const to of ['RUNNING', 'COMPLETED', 'INCOMPLETE'] as const) {
				expect(canTransition(from, to), `${from} -> ${to}`).toBe(false)
			}
		}
	})

	it('does not restart a running Run', () => {
		expect(canTransition('RUNNING', 'RUNNING')).toBe(false)
	})
})
