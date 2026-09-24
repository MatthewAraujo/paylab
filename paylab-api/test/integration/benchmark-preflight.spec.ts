import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PreflightError, prepareBenchmarkDatabase } from '../../bench/lib/preflight'
import { snapshotTemplate, withAdmin } from '../../bench/lib/reset'
import {
	benchDatabase,
	createSeededDatabase,
	dropDatabases,
	withPool,
} from '../support/bench-database'

const failureOf = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(error) => error as PreflightError,
	)

describe('Benchmark preflight (small dataset)', () => {
	const good = benchDatabase('paylab_bench_it_pre')
	const bad = benchDatabase('paylab_bench_it_bad')
	const missing = benchDatabase('paylab_bench_it_missing')
	const drifted = benchDatabase('paylab_bench_it_drift')
	const everything = [good, bad, missing, drifted].flatMap((d) => [d.name, d.templateName])

	beforeAll(async () => {
		await createSeededDatabase(good.name)
		await snapshotTemplate(good)

		// A template whose data violates the ledger invariants (the triggers are bypassed on purpose).
		await withAdmin(bad.url, (admin) =>
			admin.query(`CREATE DATABASE "${bad.name}" TEMPLATE "${good.templateName}"`),
		)
		await withPool(bad.name, async (pool) => {
			await pool.query('ALTER TABLE ledger_entries DISABLE TRIGGER USER')
			await pool.query(
				'UPDATE ledger_entries SET amount = amount + 1 WHERE id = (SELECT id FROM ledger_entries LIMIT 1)',
			)
			await pool.query('ALTER TABLE ledger_entries ENABLE TRIGGER USER')
		})
		await snapshotTemplate(bad)

		// A template whose recorded digest no longer matches its data.
		await withAdmin(drifted.url, async (admin) => {
			await admin.query(`CREATE DATABASE "${drifted.templateName}" TEMPLATE "${good.templateName}"`)
			await admin.query(
				`COMMENT ON DATABASE "${drifted.templateName}" IS 'paylab-bench-template {"digest":"0000"}'`,
			)
		})
	}, 300_000)

	afterAll(async () => {
		await dropDatabases(...everything)
	})

	it('restores, migrates, validates, and returns the dataset with the environment facts', async () => {
		const info = await prepareBenchmarkDatabase(good)

		expect(info.fingerprint).toMatch(/^[0-9a-f]{32}$/)
		expect(info.description).toContain('10200 payments')
		expect(info.environment?.postgres).toMatch(/^16\./)
		expect(info.environment).toHaveProperty('shared_buffers')
	}, 120_000)

	it('gives the same dataset fingerprint on every preparation', async () => {
		const first = await prepareBenchmarkDatabase(good)
		const second = await prepareBenchmarkDatabase(good)

		expect(second.fingerprint).toBe(first.fingerprint)
	}, 180_000)

	it('fails at the template step, with the way to create one, when there is no template', async () => {
		await dropDatabases(missing.templateName)

		const failure = await failureOf(prepareBenchmarkDatabase(missing))

		expect(failure?.step).toBe('template')
		expect(failure?.message).toContain(missing.templateName)
		expect(failure?.message).toContain('pnpm bench:template')
	})

	it('fails the invariant gate when the restored data breaks the ledger', async () => {
		const failure = await failureOf(prepareBenchmarkDatabase(bad))

		expect(failure?.step).toBe('invariants')
		expect(failure?.message).toMatch(/sum of all ledger entries/)
	}, 120_000)

	it('fails the dataset step when the template no longer matches its recorded digest', async () => {
		const failure = await failureOf(prepareBenchmarkDatabase(drifted))

		expect(failure?.step).toBe('dataset')
		expect(failure?.message).toMatch(/drift|digest/i)
	}, 120_000)
})
