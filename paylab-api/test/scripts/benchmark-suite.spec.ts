import { scenarioFingerprint } from '@/domain/benchmark/canonical'
import { t13Scenarios } from '../../scripts/benchmark/suite'

describe('the registered T13 group', () => {
	const scenarios = t13Scenarios()

	it('registers every read query as its own scenario of the group', () => {
		expect(scenarios).toHaveLength(33)
		expect(new Set(scenarios.map((s) => s.definition.id)).size).toBe(33)
		for (const scenario of scenarios) {
			expect(scenario.definition.group).toBe('t13')
		}
	})

	it('declares the T13 protocol on every scenario', () => {
		for (const scenario of scenarios) {
			expect(scenario.definition.protocol).toEqual({
				warmupRuns: 1,
				repetitions: 7,
				aggregation: 'median',
			})
		}
	})

	it('runs each scenario as a separate process that receives only its own identifier', () => {
		const first = scenarios[0]

		expect(first.command).toBe(process.execPath)
		expect(first.args.at(-1)).toBe(first.definition.id)
		expect(first.args).toContain('bench/scenarios/t13-reads.ts')
	})

	it('has stable, distinct fingerprints', () => {
		const fingerprints = scenarios.map((s) => scenarioFingerprint(s.definition))

		expect(new Set(fingerprints).size).toBe(33)
		expect(t13Scenarios().map((s) => scenarioFingerprint(s.definition))).toEqual(fingerprints)
	})
})
