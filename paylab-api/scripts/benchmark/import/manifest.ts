// What the legacy evidence says about itself, quoted from the results documents. None of this is
// stored in the raw files; nothing here is inferred or measured now.

/** Where the evidence lives, relative to the repository root. */
export const EVIDENCE = {
	t13BaselineQueries: 'docs/experiments/raw/final-base.txt',
	t13BaselineDepth: 'docs/experiments/raw/depth-baseline.txt',
	t13BaselineQueryPlans: 'docs/experiments/plans/final-baseline.txt',
	t13BaselineDepthPlans: 'docs/experiments/plans/depth-baseline.txt',
	t13AdoptedQueries: 'docs/experiments/raw/final-adopted.txt',
	t13AdoptedDepth: 'docs/experiments/raw/depth-adopted.txt',
	t13AdoptedQueryPlans: 'docs/experiments/plans/final-adopted.txt',
	t13AdoptedDepthPlans: 'docs/experiments/plans/depth-adopted.txt',
	t14Load: 'docs/experiments/raw/T14-load.jsonl',
	t14Correctness: 'docs/experiments/raw/T14-correctness.txt',
} as const

// docs/experiments/T13-results.md and T14-results.md: "Machine: AMD Ryzen 7 5825U (8 cores, 16
// logical CPUs), 15 GiB RAM, Linux ... PostgreSQL 16.15 (postgres:16-alpine, Docker)". The keys
// mirror the ones a native Run records, so the two can be compared where the facts agree.
const MACHINE = {
	platform: 'linux',
	cpuModel: 'AMD Ryzen 7 5825U',
	cpuCount: '16',
	memoryGb: '15',
	postgres: '16.15',
	shared_buffers: '1GB',
	work_mem: '32MB',
	effective_cache_size: '3GB',
}

/** T13 read measurements: `random_page_cost=4`, `synchronous_commit=on`; the helpers were Python and psql. */
export const T13_ENVIRONMENT = { ...MACHINE, random_page_cost: '4', synchronous_commit: 'on' }

/** T14: `max_wal_size=4GB`, `deadlock_timeout=1s`, `max_connections=100`, driver Node 24.5.0. The commit mode varies per cell. */
export const T14_ENVIRONMENT = {
	...MACHINE,
	node: '24.5.0',
	max_wal_size: '4GB',
	deadlock_timeout: '1s',
	max_connections: '100',
}

/** docs/benchmark.md: two full runs of seed paylab-benchmark-v1 gave this aggregate digest. */
export const DATASET = {
	fingerprint: 'f827ada9033d9ffa27971798ff908eff',
	description: '1001000 payments, 1000 wallets, 50 merchants',
}

export const IMPORTED_AT = {
	// T13 stores no measurement time: the date of the commit that recorded it (a6f7a75).
	t13: '2026-09-23T20:14:51.000Z',
	// raw/T14-load.started, written by the matrix runner when it began.
	t14: '2026-09-23T21:28:52.000Z',
}

const NOT_RECORDED = 'Commit, branch and finish time were not recorded.'

export const NOTES = {
	t13Baseline: `Imported from the T13 results (schema state: baseline, constraint-provided indexes only). The measurement time was not stored, so the start time is the date the evidence was recorded. ${NOT_RECORDED} Only the median latency per query was recorded.`,
	t13Adopted: `Imported from the T13 results (schema state: adopted, after migration 20260923160000). Measured in the same session as the baseline. The measurement time was not stored, so the start time is the date the evidence was recorded. ${NOT_RECORDED} Only the median latency per query was recorded.`,
	t14: `Imported from the T14 results (matrix v2: 10 s windows, 3 repetitions, Latin-square order, both commit modes). The start time is the one written when the matrix began; the warm-up (2 s) is the driver default of the time. ${NOT_RECORDED}`,
}
