// Plain-object fixtures: they deliberately do not import the benchmark contract, so the
// specs check the contract against independent literals.
type Json = Record<string, unknown>

export function buildMetric(overrides: Json = {}): Json {
	return {
		key: 'tps',
		label: 'Throughput',
		unit: 'tx/s',
		direction: 'HIGHER_IS_BETTER',
		aggregation: 'median',
		value: 1000,
		...overrides,
	}
}

export function buildScenario(overrides: Json = {}): Json {
	return {
		id: 't14.settle.hot',
		group: 't14',
		title: 'Hot settlement',
		fingerprint: 'fp-settle-hot-1',
		protocol: { warmupMs: 2000, durationMs: 10000, repetitions: 3, aggregation: 'median' },
		config: { clients: 16 },
		status: 'COMPLETED',
		metrics: [buildMetric()],
		...overrides,
	}
}

export function buildSummary(overrides: Json = {}): Json {
	return {
		schemaVersion: 1,
		runId: '2026-09-23T10-00-00Z-abc1234',
		kind: 'native',
		status: 'COMPLETED',
		note: 'baseline after index change',
		source: { commit: 'abc1234def5678', branch: 'main' },
		startedAt: '2026-09-23T10:00:00.000Z',
		finishedAt: '2026-09-23T10:30:00.000Z',
		durationMs: 1800000,
		executor: { version: '1.0.0' },
		environment: { fingerprint: 'env-1', details: { node: '22.1.0', postgres: '16.3' } },
		dataset: { fingerprint: 'ds-1', description: 'full skewed dataset' },
		scenarios: [buildScenario()],
		artifacts: [],
		...overrides,
	}
}
