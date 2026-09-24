import type { BenchmarkSuite } from './executor'

/**
 * The complete Benchmark Suite known by this source revision. Scenario groups are registered
 * here: the dataset, correctness gates and T13 reads (B3), then the T14 matrix (B4).
 */
export const suite: BenchmarkSuite = {
	scenarios: [],
	prepare: async () => {
		throw new Error('No benchmark scenarios are registered yet')
	},
}
