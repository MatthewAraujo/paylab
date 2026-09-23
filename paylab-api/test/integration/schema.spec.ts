import { prisma } from '../support/database'

// Direct SQL against the real schema: the constraints are the subject, so no
// application code sits between the test and PostgreSQL.

// Prisma reports unique violations (SQLSTATE 23505) with the key columns, not the index name.
const UNIQUE_VIOLATION_ON_CURRENCY = /23505.*Key \(currency\)=\(BRL\)/
const UNIQUE_VIOLATION_ON_IDEMPOTENCY_KEY = /23505.*Key \(merchant_id, idempotency_key\)/
const UNIQUE_VIOLATION_ON_LEDGER_TRANSACTION = /23505.*Key \(ledger_transaction_id\)/

async function one<T>(query: string, ...params: unknown[]): Promise<T> {
	const rows = await prisma.$queryRawUnsafe<T[]>(query, ...params)
	return rows[0]
}

async function createMerchant(name = 'Acme') {
	const { id } = await one<{ id: string }>(
		'INSERT INTO merchants (name) VALUES ($1) RETURNING id',
		name,
	)
	return id
}

async function createWallet(merchantId: string) {
	const { id } = await one<{ id: string }>(
		`INSERT INTO accounts (kind, merchant_id, currency)
		 VALUES ('WALLET', $1::uuid, 'BRL') RETURNING id`,
		merchantId,
	)
	return id
}

async function clearingAccountId() {
	const { id } = await one<{ id: string }>(
		`SELECT id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'`,
	)
	return id
}

async function createLedgerTransaction() {
	const { id } = await one<{ id: string }>(
		'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
	)
	return id
}

async function createPayment(
	merchantId: string,
	source: string,
	destination: string,
	idempotencyKey: string,
	ledgerTransactionId: string | null = null,
) {
	const { id } = await one<{ id: string }>(
		`INSERT INTO payments
		   (merchant_id, source_account_id, destination_account_id, amount, currency,
		    status, idempotency_key, request_fingerprint, ledger_transaction_id)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, 1000, 'BRL', 'CREATED', $4, 'fp', $5::uuid)
		 RETURNING id`,
		merchantId,
		source,
		destination,
		idempotencyKey,
		ledgerTransactionId,
	)
	return id
}

describe('Schema baseline (integration)', () => {
	test('the BRL External Clearing Account exists after migrations from an empty database', async () => {
		const rows = await prisma.$queryRawUnsafe<{ merchant_id: string | null }[]>(
			`SELECT merchant_id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'`,
		)

		expect(rows).toHaveLength(1)
		expect(rows[0].merchant_id).toBeNull()
	})

	test('a Wallet must have a Merchant', async () => {
		await expect(
			prisma.$executeRawUnsafe(`INSERT INTO accounts (kind, currency) VALUES ('WALLET', 'BRL')`),
		).rejects.toThrow(/accounts_kind_merchant_check/)
	})

	test('an External Clearing Account must not have a Merchant', async () => {
		const merchantId = await createMerchant()

		await expect(
			prisma.$executeRawUnsafe(
				`INSERT INTO accounts (kind, merchant_id, currency)
				 VALUES ('EXTERNAL_CLEARING', $1::uuid, 'USD')`,
				merchantId,
			),
		).rejects.toThrow(/accounts_kind_merchant_check/)
	})

	test('only one External Clearing Account per currency', async () => {
		await expect(
			prisma.$executeRawUnsafe(
				`INSERT INTO accounts (kind, currency) VALUES ('EXTERNAL_CLEARING', 'BRL')`,
			),
		).rejects.toThrow(UNIQUE_VIOLATION_ON_CURRENCY)
	})

	test('a Ledger Entry with a zero or negative amount is rejected', async () => {
		const wallet = await createWallet(await createMerchant())
		const transaction = await createLedgerTransaction()

		for (const amount of [0, -1]) {
			await expect(
				prisma.$executeRawUnsafe(
					`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
					 VALUES ($1::uuid, $2::uuid, 'CREDIT', $3)`,
					transaction,
					wallet,
					amount,
				),
			).rejects.toThrow(/ledger_entries_amount_positive_check/)
		}
	})

	test('a Ledger Entry referencing a missing Ledger Transaction or Account is rejected', async () => {
		const wallet = await createWallet(await createMerchant())
		const transaction = await createLedgerTransaction()
		const missing = '00000000-0000-0000-0000-000000000000'
		const insert = `INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
			VALUES ($1::uuid, $2::uuid, 'CREDIT', 100)`

		await expect(prisma.$executeRawUnsafe(insert, missing, wallet)).rejects.toThrow(
			/ledger_entries_ledger_transaction_id_fkey/,
		)
		await expect(prisma.$executeRawUnsafe(insert, transaction, missing)).rejects.toThrow(
			/ledger_entries_account_id_fkey/,
		)
	})

	test('two Payments with the same Merchant and Idempotency Key are rejected', async () => {
		const merchantId = await createMerchant()
		const wallet = await createWallet(merchantId)
		const clearing = await clearingAccountId()

		await createPayment(merchantId, clearing, wallet, 'key-1')

		await expect(createPayment(merchantId, clearing, wallet, 'key-1')).rejects.toThrow(
			UNIQUE_VIOLATION_ON_IDEMPOTENCY_KEY,
		)
	})

	test('the same Idempotency Key for two different Merchants is accepted', async () => {
		const clearing = await clearingAccountId()
		const merchantA = await createMerchant('A')
		const merchantB = await createMerchant('B')
		const walletA = await createWallet(merchantA)
		const walletB = await createWallet(merchantB)

		await createPayment(merchantA, clearing, walletA, 'shared-key')
		await createPayment(merchantB, clearing, walletB, 'shared-key')
	})

	test('a Ledger Transaction can be referenced by at most one Payment', async () => {
		const merchantId = await createMerchant()
		const wallet = await createWallet(merchantId)
		const clearing = await clearingAccountId()
		const transaction = await createLedgerTransaction()

		await createPayment(merchantId, clearing, wallet, 'key-a', transaction)

		await expect(createPayment(merchantId, clearing, wallet, 'key-b', transaction)).rejects.toThrow(
			UNIQUE_VIOLATION_ON_LEDGER_TRANSACTION,
		)
	})

	test('foreign keys are restrictive: an Account with entries cannot be deleted', async () => {
		const wallet = await createWallet(await createMerchant())
		const transaction = await createLedgerTransaction()
		await prisma.$executeRawUnsafe(
			`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
			 VALUES ($1::uuid, $2::uuid, 'CREDIT', 100)`,
			transaction,
			wallet,
		)

		await expect(
			prisma.$executeRawUnsafe('DELETE FROM accounts WHERE id = $1::uuid', wallet),
		).rejects.toThrow(/ledger_entries_account_id_fkey/)
	})

	test('the clearing Account survives the database reset between tests', async () => {
		expect(await clearingAccountId()).toBeDefined()
	})
})
