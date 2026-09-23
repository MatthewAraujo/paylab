import { prisma } from './database'

// Direct-SQL fixtures for database specs: no application code between the test
// and PostgreSQL, so constraints and triggers are exercised as they are.

export async function one<T>(query: string, ...params: unknown[]): Promise<T> {
	const rows = await prisma.$queryRawUnsafe<T[]>(query, ...params)
	return rows[0]
}

export async function createMerchant(name = 'Acme') {
	const { id } = await one<{ id: string }>(
		'INSERT INTO merchants (name) VALUES ($1) RETURNING id',
		name,
	)
	return id
}

export async function createWallet(merchantId: string) {
	const { id } = await one<{ id: string }>(
		`INSERT INTO accounts (kind, merchant_id, currency)
		 VALUES ('WALLET', $1::uuid, 'BRL') RETURNING id`,
		merchantId,
	)
	return id
}

export async function clearingAccountId() {
	const { id } = await one<{ id: string }>(
		`SELECT id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'`,
	)
	return id
}

// Commits one valid Ledger Transaction funding a Wallet: clearing debit, Wallet credit.
export async function createFundingLedgerTransaction(
	walletId: string,
	clearingId: string,
	amount = 100,
) {
	return prisma.$transaction(async (tx) => {
		const [{ id }] = await tx.$queryRawUnsafe<{ id: string }[]>(
			'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
		)
		await tx.$executeRawUnsafe(
			`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
			 VALUES ($1::uuid, $2::uuid, 'DEBIT', $4), ($1::uuid, $3::uuid, 'CREDIT', $4)`,
			id,
			clearingId,
			walletId,
			amount,
		)
		return id
	})
}
