import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedBenchmark } from '../../bench/lib/seed'
import { collectDatasetStats } from '../../bench/lib/stats'
import { getInvariantViolations } from '../support/invariants'

// T12 validation: a small parameterized run of the benchmark generator must produce a
// dataset that respects the ledger triggers, the global invariants, the documented
// ratios and skew, and is reproducible from its seed.
const SMALL = { seed: 'small', payments: 10_000, wallets: 200, merchants: 10, batchSize: 2_500 }

describe('Benchmark dataset generator (small run)', () => {
	let pool: Pool

	beforeAll(() => {
		pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
	})

	afterAll(async () => {
		await pool.end()
	})

	it('creates the expected counts, with two entries per settled Payment', async () => {
		await seedBenchmark(pool, SMALL)
		const stats = await collectDatasetStats(pool)

		expect(stats.merchants).toBe(SMALL.merchants)
		expect(stats.wallets).toBe(SMALL.wallets)
		// One funding Payment per Wallet on top of the requested Payments.
		expect(stats.payments).toBe(SMALL.payments + SMALL.wallets)
		const settled = stats.paymentsByStatus.SUCCEEDED
		expect(settled).toBeGreaterThan(SMALL.payments * 0.9)
		expect(stats.ledgerTransactions).toBe(settled)
		expect(stats.entries).toBe(2 * settled)
		expect(stats.settledWithoutLedgerTransaction).toBe(0)
		expect(stats.unsettledWithLedgerTransaction).toBe(0)
		// Every status is present so status filters and the report have something to show.
		for (const status of ['CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED'] as const) {
			expect(stats.paymentsByStatus[status]).toBeGreaterThan(0)
		}
	})

	it('passes the global invariant helper and never overdraws a Wallet at any point in time', async () => {
		await seedBenchmark(pool, SMALL)

		expect(await getInvariantViolations()).toEqual([])
		const stats = await collectDatasetStats(pool)
		expect(stats.walletsEverNegative).toBe(0)
	})

	it('gives the top 1% of Wallets about half of the Wallet entries', async () => {
		await seedBenchmark(pool, SMALL)
		const stats = await collectDatasetStats(pool)

		expect(stats.topOnePercentEntryShare).toBeGreaterThan(0.45)
		expect(stats.topOnePercentEntryShare).toBeLessThan(0.55)
	})

	it('is deterministic: the same seed gives identical aggregates, another seed does not', async () => {
		await seedBenchmark(pool, SMALL)
		const first = await collectDatasetStats(pool)
		await seedBenchmark(pool, SMALL)
		const second = await collectDatasetStats(pool)
		await seedBenchmark(pool, { ...SMALL, seed: 'other' })
		const other = await collectDatasetStats(pool)

		expect(second).toEqual(first)
		expect(other.digest).not.toBe(first.digest)
	})

	it('leaves no helper objects behind and keeps every trigger enabled', async () => {
		await seedBenchmark(pool, SMALL)
		const stats = await collectDatasetStats(pool)

		expect(stats.leftoverHelperObjects).toEqual([])
		expect(stats.disabledTriggers).toEqual([])
		expect(stats.analyzed).toBe(true)
	})
})
