import { canonicalJson, fingerprint, scenarioFingerprint } from '@/domain/benchmark/canonical'
import { serializeSummary } from '@/domain/benchmark/serialize'
import { parseSummary } from '@/domain/benchmark/summary'
import { buildScenario, buildSummary } from '../../support/benchmark-fixtures'

describe('canonicalJson and fingerprint', () => {
	it('ignores object key order', () => {
		expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}')
	})

	it('keeps array order', () => {
		expect(canonicalJson([2, 1])).toBe('[2,1]')
	})

	it('matches a SHA-256 computed outside the code', () => {
		// printf '{"a":1,"b":[true,null,"x"]}' | sha256sum
		expect(fingerprint({ b: [true, null, 'x'], a: 1 })).toBe(
			'eca8cfb31ab74533e1eb2f4c74d2d55dfe3c79ac704787e54be8647ea7777eb1',
		)
	})
})

describe('scenarioFingerprint', () => {
	const definition = {
		id: 't14.settle.hot',
		protocol: { warmupMs: 2000, durationMs: 10000, repetitions: 3, aggregation: 'median' },
		config: { clients: 16, strategy: 'lock' },
	}

	it('is stable when config keys are reordered', () => {
		const reordered = { ...definition, config: { strategy: 'lock', clients: 16 } }

		expect(scenarioFingerprint(reordered)).toBe(scenarioFingerprint(definition))
	})

	it('changes when the workload or the protocol changes', () => {
		const otherWorkload = { ...definition, config: { clients: 32, strategy: 'lock' } }
		const otherProtocol = {
			...definition,
			protocol: { ...definition.protocol, repetitions: 5 },
		}

		expect(scenarioFingerprint(otherWorkload)).not.toBe(scenarioFingerprint(definition))
		expect(scenarioFingerprint(otherProtocol)).not.toBe(scenarioFingerprint(definition))
	})
})

describe('serializeSummary', () => {
	function parsed(input: Record<string, unknown>) {
		const result = parseSummary(input)
		if (result.isLeft()) throw result.value
		return result.value
	}

	it('produces identical text whatever the key order of the input', () => {
		const a = parsed(buildSummary())
		const reordered = Object.fromEntries(Object.entries(buildSummary()).reverse())
		const b = parsed(reordered)

		expect(serializeSummary(a)).toBe(serializeSummary(b))
	})

	it('is reviewable: indented, sorted keys, one trailing newline', () => {
		const text = serializeSummary(parsed(buildSummary({ scenarios: [buildScenario()] })))

		expect(text.endsWith('}\n')).toBe(true)
		expect(text.startsWith('{\n  "artifacts": [],\n')).toBe(true)
	})

	it('round-trips through the parser', () => {
		const summary = parsed(buildSummary())

		expect(parsed(JSON.parse(serializeSummary(summary)))).toEqual(summary)
	})
})
