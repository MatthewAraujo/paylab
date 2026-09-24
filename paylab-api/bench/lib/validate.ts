import { Client, Pool } from 'pg'
import { findInvariantViolations } from '../../scripts/demo/apply'
import { type DatasetStats, collectDatasetStats } from './stats'

export interface DatasetValidation {
	stats: DatasetStats
	/** Structural problems: ratios, negative Balances, leftovers, disabled triggers. */
	problems: string[]
	/** Global ledger invariants (the helper every database test runs). */
	invariantViolations: string[]
}

/** The checks of `pnpm bench:validate`, usable by the benchmark preflight as a gate. */
export async function validateDataset(url: string): Promise<DatasetValidation> {
	const pool = new Pool({ connectionString: url, max: 1 })
	const client = new Client({ connectionString: url })
	try {
		await client.connect()
		const stats = await collectDatasetStats(pool)
		const invariantViolations = await findInvariantViolations(client)

		const problems: string[] = []
		if (stats.walletsEverNegative > 0) {
			problems.push(`${stats.walletsEverNegative} Wallets went negative`)
		}
		if (stats.entries !== 2 * stats.paymentsByStatus.SUCCEEDED) {
			problems.push('entries are not 2 per settled Payment')
		}
		if (stats.leftoverHelperObjects.length > 0) {
			problems.push(`leftover: ${stats.leftoverHelperObjects}`)
		}
		if (stats.disabledTriggers.length > 0) {
			problems.push(`disabled triggers: ${stats.disabledTriggers}`)
		}
		return { stats, problems, invariantViolations }
	} finally {
		await client.end()
		await pool.end()
	}
}
