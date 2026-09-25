import { scenarioFingerprint } from '@/domain/benchmark/canonical'
import { T14_PROTOCOL } from '../../bench/scenarios/t14-matrix'
import { t13Scenarios, t14Scenarios } from '../../scripts/benchmark/suite'

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

describe('the registered T14 group', () => {
	const database = {
		url: 'postgresql://paylab:paylab@localhost:5433/paylab_bench',
		name: 'paylab_bench',
		templateName: 'paylab_bench_template',
	}
	const scenarios = t14Scenarios(database)

	it('registers the correctness gate first, then the 16 cells of the matrix', () => {
		expect(scenarios).toHaveLength(17)
		expect(scenarios[0].definition.id).toBe('t14.correctness')
		expect(scenarios.slice(1).map((s) => s.definition.id)).toEqual(
			expect.arrayContaining(['t14.load.H.c4.sync-off', 't14.load.M.c64.sync-on']),
		)
		expect(scenarios.every((s) => s.definition.group === 't14')).toBe(true)
	})

	it('declares the accepted protocol on every cell and passes it to the process', () => {
		for (const scenario of scenarios.slice(1)) {
			expect(scenario.definition.protocol).toEqual({ ...T14_PROTOCOL })
			expect(scenario.args.join(' ')).toContain(
				'--warmup-ms 2000 --duration-ms 10000 --repetitions 3',
			)
		}
	})

	it('covers the workload in the definition, so a changed workload is not comparable', () => {
		const cell = scenarios[1].definition.config
		expect(cell).toMatchObject({
			shape: 'H',
			clients: 4,
			sync: 'off',
			rotation: 'latin-square',
			strategies: ['nokey', 'forupdate', 'serializable', 'optimistic', 'advisory'],
			workload: { amountCentavos: 100, batchSize: 50, fundCentavos: 100000000, maxAttempts: 50 },
		})
	})

	it('resets the database before the gate, which creates data; the cells reset themselves per block', () => {
		expect(scenarios[0].prepare).toBeTypeOf('function')
		expect(scenarios[1].prepare).toBeUndefined()
	})

	it('has stable, distinct fingerprints', () => {
		const fingerprints = scenarios.map((s) => scenarioFingerprint(s.definition))
		expect(new Set(fingerprints).size).toBe(17)
	})
})
