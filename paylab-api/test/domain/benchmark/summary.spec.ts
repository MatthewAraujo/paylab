import { parseSummary } from '@/domain/benchmark/summary'
import { buildMetric, buildScenario, buildSummary } from '../../support/benchmark-fixtures'

describe('parseSummary', () => {
	it('accepts a completed native Summary', () => {
		const result = parseSummary(buildSummary())

		expect(result.isRight()).toBe(true)
		if (result.isRight()) {
			expect(result.value.runId).toBe('2026-09-23T10-00-00Z-abc1234')
			expect(result.value.status).toBe('COMPLETED')
		}
	})

	it('rejects an unknown schema version', () => {
		expect(parseSummary(buildSummary({ schemaVersion: 2 })).isLeft()).toBe(true)
	})

	it('rejects a run identifier that could escape a directory', () => {
		for (const runId of ['../etc', 'a/b', 'a\\b', '', '.hidden']) {
			expect(parseSummary(buildSummary({ runId })).isLeft(), runId).toBe(true)
		}
	})

	it('rejects a malformed record', () => {
		expect(parseSummary(null).isLeft()).toBe(true)
		expect(parseSummary({ schemaVersion: 1 }).isLeft()).toBe(true)
	})

	it('keeps an absent metric absent instead of turning it into zero', () => {
		const scenario = buildScenario({ metrics: [] })
		const result = parseSummary(buildSummary({ scenarios: [scenario] }))

		expect(result.isRight() && result.value.scenarios[0].metrics).toEqual([])
	})

	it('rejects a metric without a numeric value', () => {
		const scenario = buildScenario({
			metrics: [
				{ key: 'tps', label: 'TPS', unit: 'tx/s', direction: 'HIGHER_IS_BETTER', value: null },
			],
		})

		expect(parseSummary(buildSummary({ scenarios: [scenario] })).isLeft()).toBe(true)
	})

	it('accepts only the declared summary roles for overview highlights', () => {
		const withRole = (summaryRole: string) =>
			buildSummary({ scenarios: [buildScenario({ metrics: [buildMetric({ summaryRole })] })] })

		expect(parseSummary(withRole('THROUGHPUT')).isRight()).toBe(true)
		expect(parseSummary(withRole('LOUDEST')).isLeft()).toBe(true)
	})
})
