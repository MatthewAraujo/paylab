import { prisma, resetDatabase } from '../support/database'
import { clearingAccountId, createMerchant, createWallet } from '../support/fixtures'
import { assertGlobalInvariants, getInvariantViolations } from '../support/invariants'

// Inserts entries that PostgreSQL would normally refuse, by disabling the ledger
// triggers on both ledger tables (table-wide, which is safe because database
// suites run serially). Always re-enabled, and callers reset the data, so the
// automatic post-test invariant check stays meaningful.
async function withTriggersDisabled(action: () => Promise<void>) {
	await prisma.$executeRawUnsafe('ALTER TABLE ledger_entries DISABLE TRIGGER USER')
	await prisma.$executeRawUnsafe('ALTER TABLE ledger_transactions DISABLE TRIGGER USER')
	try {
		await action()
	} finally {
		await prisma.$executeRawUnsafe('ALTER TABLE ledger_entries ENABLE TRIGGER USER')
		await prisma.$executeRawUnsafe('ALTER TABLE ledger_transactions ENABLE TRIGGER USER')
	}
}

async function insertRawEntries(
	rows: { account: string; direction: 'DEBIT' | 'CREDIT'; amount: number }[],
) {
	// One database transaction, as in production: the deferred checks run at commit.
	await prisma.$transaction(async (tx) => {
		const [{ id }] = await tx.$queryRawUnsafe<{ id: string }[]>(
			'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
		)
		for (const row of rows) {
			await tx.$executeRawUnsafe(
				`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
				 VALUES ($1::uuid, $2::uuid, $3::entry_direction, $4)`,
				id,
				row.account,
				row.direction,
				row.amount,
			)
		}
	})
}

describe('Global invariant helper (integration)', () => {
	test('is clean on an empty ledger', async () => {
		expect(await getInvariantViolations()).toEqual([])
		await assertGlobalInvariants()
	})

	test('is clean after valid movements', async () => {
		const wallet = await createWallet(await createMerchant())
		const clearing = await clearingAccountId()

		await prisma.$transaction(async (tx) => {
			const [{ id }] = await tx.$queryRawUnsafe<{ id: string }[]>(
				'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
			)
			await tx.$executeRawUnsafe(
				`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
				 VALUES ($1::uuid, $2::uuid, 'DEBIT', 500), ($1::uuid, $3::uuid, 'CREDIT', 500)`,
				id,
				clearing,
				wallet,
			)
		})

		expect(await getInvariantViolations()).toEqual([])
		await assertGlobalInvariants()
	})

	test('reports a violation when the total of all entries is not zero', async () => {
		const wallet = await createWallet(await createMerchant())
		const clearing = await clearingAccountId()

		try {
			await withTriggersDisabled(() =>
				insertRawEntries([
					{ account: clearing, direction: 'DEBIT', amount: 80 },
					{ account: wallet, direction: 'CREDIT', amount: 70 },
				]),
			)

			const violations = await getInvariantViolations()
			expect(violations).toHaveLength(1)
			expect(violations[0]).toMatch(/sum of all ledger entries is 10/)
			await expect(assertGlobalInvariants()).rejects.toThrow(/sum of all ledger entries/)
		} finally {
			await resetDatabase()
		}
	})

	test('reports a violation when a Wallet Balance is negative', async () => {
		const wallet = await createWallet(await createMerchant())
		const clearing = await clearingAccountId()

		try {
			// Balanced, so the ledger triggers accept it: overdrafts are Settlement's job (T6),
			// and this check is the safety net for when that logic is wrong.
			await insertRawEntries([
				{ account: wallet, direction: 'DEBIT', amount: 100 },
				{ account: clearing, direction: 'CREDIT', amount: 100 },
			])

			const violations = await getInvariantViolations()
			expect(violations).toHaveLength(1)
			expect(violations[0]).toMatch(/negative Balance/)
			expect(violations[0]).toContain(wallet)
			expect(violations[0]).toContain('-100')
		} finally {
			await resetDatabase()
		}
	})

	test('does not count the clearing Account as a negative Wallet', async () => {
		const wallet = await createWallet(await createMerchant())
		const clearing = await clearingAccountId()

		// Funding a Wallet leaves the clearing Account with a negative Balance by design.
		await prisma.$transaction(async (tx) => {
			const [{ id }] = await tx.$queryRawUnsafe<{ id: string }[]>(
				'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
			)
			await tx.$executeRawUnsafe(
				`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
				 VALUES ($1::uuid, $2::uuid, 'DEBIT', 300), ($1::uuid, $3::uuid, 'CREDIT', 300)`,
				id,
				clearing,
				wallet,
			)
		})

		expect(await getInvariantViolations()).toEqual([])
	})
})
