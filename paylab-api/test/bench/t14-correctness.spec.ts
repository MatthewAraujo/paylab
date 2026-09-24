import type { CorrectnessResult } from '../../bench/exp/strategies/correctness'
import { correctnessMetrics, evaluateGate } from '../../bench/scenarios/t14-correctness'

const result = (
	strategy: CorrectnessResult['strategy'],
	failures: string[] = [],
	extra: Partial<CorrectnessResult> = {},
): CorrectnessResult => ({ strategy, failures, notes: [], retries: 0, deadlocks: 0, ...extra })

const allPass = () => [
	result('nokey'),
	result('forupdate', ['S3: 3413 deadlocks'], { deadlocks: 3413, retries: 3413 }),
	result('serializable', [], { retries: 6801 }),
	result('optimistic', [], { retries: 4545 }),
	result('advisory'),
]

describe('evaluateGate', () => {
	it('accepts the recorded outcome: four strategies pass, FOR UPDATE only deadlocks', () => {
		expect(evaluateGate(allPass())).toEqual({ ok: true, problems: [] })
	})

	it('also accepts FOR UPDATE passing, since that is not a correctness problem', () => {
		const results = allPass().map((r) => (r.strategy === 'forupdate' ? result('forupdate') : r))

		expect(evaluateGate(results).ok).toBe(true)
	})

	it('fails when the production strategy breaks the ledger', () => {
		const results = allPass().map((r) =>
			r.strategy === 'nokey' ? result('nokey', ['S1: final Balance 1000, expected 0']) : r,
		)

		const gate = evaluateGate(results)

		expect(gate.ok).toBe(false)
		expect(gate.problems).toEqual(['nokey: S1: final Balance 1000, expected 0'])
	})

	it('fails on a global invariant violation, whatever the strategy', () => {
		const results = allPass().map((r) =>
			r.strategy === 'advisory'
				? result('advisory', ['invariant: sum of all ledger entries is 5, expected 0'])
				: r,
		)

		expect(evaluateGate(results).problems).toEqual([
			'advisory: invariant: sum of all ledger entries is 5, expected 0',
		])
	})

	it('fails when FOR UPDATE fails for any reason other than the known deadlocks', () => {
		const results = allPass().map((r) =>
			r.strategy === 'forupdate'
				? result('forupdate', ['S3: 12 deadlocks', 'S2 round 3: negative Balance -100'])
				: r,
		)

		expect(evaluateGate(results).problems).toEqual(['forupdate: S2 round 3: negative Balance -100'])
	})
})

describe('correctnessMetrics', () => {
	it('reports, per strategy, the unexpected failures, the crossed-transfer deadlocks, and the retries', () => {
		const metrics = correctnessMetrics(allPass())
		const value = (key: string, strategy: string) =>
			metrics.find((m) => m.key === key && m.dimensions?.strategy === strategy)?.value

		expect(value('correctness_violations', 'nokey')).toBe(0)
		expect(value('correctness_violations', 'forupdate')).toBe(0)
		expect(value('crossed_transfer_deadlocks', 'forupdate')).toBe(3413)
		expect(value('crossed_transfer_deadlocks', 'nokey')).toBe(0)
		expect(value('correctness_retries', 'serializable')).toBe(6801)
		expect(metrics.every((m) => m.direction === 'LOWER_IS_BETTER')).toBe(true)
	})

	it('counts an unexpected failure as a violation', () => {
		const metrics = correctnessMetrics([result('nokey', ['S4 round 1: Balance 1, expected 15000'])])

		expect(metrics.find((m) => m.key === 'correctness_violations')?.value).toBe(1)
	})
})
