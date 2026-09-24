import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	readTemplateDigest,
	restoreBenchmarkDatabase,
	snapshotTemplate,
	withAdmin,
} from '../../bench/lib/reset'
import { collectDatasetStats } from '../../bench/lib/stats'
import {
	benchDatabase,
	createSeededDatabase,
	dropDatabases,
	withPool,
} from '../support/bench-database'

// Deterministic restore: every Run starts from a pristine copy of the same dataset.
describe('Benchmark database template and restore (small dataset)', () => {
	const source = benchDatabase('paylab_bench_it_reset')
	const digestOf = (name: string) =>
		withPool(name, async (pool) => (await collectDatasetStats(pool)).digest)
	let templateDigest: string

	beforeAll(async () => {
		await createSeededDatabase(source.name)
		await snapshotTemplate(source)
		templateDigest = await digestOf(source.name)
	}, 240_000)

	afterAll(async () => {
		await dropDatabases(source.name, source.templateName)
	})

	it('records the dataset digest on the template', async () => {
		expect(await readTemplateDigest(source)).toBe(templateDigest)
	})

	it('restores an identical dataset every time', async () => {
		await restoreBenchmarkDatabase(source)
		const first = await digestOf(source.name)
		await restoreBenchmarkDatabase(source)
		const second = await digestOf(source.name)

		expect(first).toBe(templateDigest)
		expect(second).toBe(templateDigest)
	}, 120_000)

	it('isolates one scenario group from the next: earlier changes never survive a restore', async () => {
		await restoreBenchmarkDatabase(source)
		await withPool(source.name, (pool) =>
			pool.query(`DELETE FROM payments WHERE status = 'CREATED'`),
		)
		expect(await digestOf(source.name)).not.toBe(templateDigest)

		await restoreBenchmarkDatabase(source)

		expect(await digestOf(source.name)).toBe(templateDigest)
	}, 120_000)

	it('closes connections that would block the restore', async () => {
		await restoreBenchmarkDatabase(source)
		await withPool(source.name, async (pool) => {
			const held = await pool.connect()
			held.on('error', () => {}) // the restore terminates it on purpose
			await held.query('SELECT 1')
			await restoreBenchmarkDatabase(source)
			held.release()
		})

		expect(await digestOf(source.name)).toBe(templateDigest)
	}, 120_000)

	it('brings a template made before the latest migration up to the schema of the revision under test', async () => {
		const old = benchDatabase('paylab_bench_it_old')
		const migration = '20260923160000_read_and_settlement_indexes'
		const indexes = [
			'ledger_entries_ledger_transaction_id_idx',
			'ledger_entries_account_created_id_idx',
			'payments_merchant_created_id_idx',
		]
		await dropDatabases(old.name, old.templateName)
		await withAdmin(old.url, (admin) =>
			admin.query(`CREATE DATABASE "${old.templateName}" TEMPLATE "${source.templateName}"`),
		)
		await withPool(old.templateName, async (pool) => {
			for (const index of indexes) await pool.query(`DROP INDEX "${index}"`)
			await pool.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [migration])
		})

		try {
			await restoreBenchmarkDatabase(old)

			await withPool(old.name, async (pool) => {
				const present = await pool.query(
					'SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)',
					[indexes],
				)
				const applied = await pool.query(
					'SELECT 1 FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL',
					[migration],
				)
				expect(present.rowCount).toBe(3)
				expect(applied.rowCount).toBe(1)
			})
		} finally {
			await dropDatabases(old.name, old.templateName)
		}
	}, 180_000)
})
