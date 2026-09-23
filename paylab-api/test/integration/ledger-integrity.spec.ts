import { prisma } from '../support/database'
import { clearingAccountId, createMerchant, createWallet } from '../support/fixtures'

// The SQL seam: the ledger invariants (ADR 0003) are enforced by PostgreSQL
// itself, so every case talks to the database directly. Constraint triggers are
// deferred, so violations surface at COMMIT, which is why each case runs inside
// an explicit transaction.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function newTransaction(tx: Tx) {
	const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
		'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
	)
	return rows[0].id
}

async function entry(
	tx: Tx,
	transactionId: string,
	accountId: string,
	direction: 'DEBIT' | 'CREDIT',
	amount: number,
) {
	await tx.$executeRawUnsafe(
		`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
		 VALUES ($1::uuid, $2::uuid, $3::entry_direction, $4)`,
		transactionId,
		accountId,
		direction,
		amount,
	)
}

async function accounts() {
	const wallet = await createWallet(await createMerchant())
	const clearing = await clearingAccountId()
	return { wallet, clearing }
}

// Commits one balanced Ledger Transaction (clearing debit, Wallet credit) and returns its ids.
async function commitBalancedTransaction(amount = 100) {
	const { wallet, clearing } = await accounts()

	return prisma.$transaction(async (tx) => {
		const transactionId = await newTransaction(tx)
		await entry(tx, transactionId, clearing, 'DEBIT', amount)
		await entry(tx, transactionId, wallet, 'CREDIT', amount)
		return { transactionId, wallet, clearing }
	})
}

describe('Ledger integrity triggers (integration)', () => {
	describe('balance at commit', () => {
		test('an unbalanced Ledger Transaction (debit 80, credit 70) fails at commit', async () => {
			const { wallet, clearing } = await accounts()

			await expect(
				prisma.$transaction(async (tx) => {
					const transactionId = await newTransaction(tx)
					await entry(tx, transactionId, clearing, 'DEBIT', 80)
					await entry(tx, transactionId, wallet, 'CREDIT', 70)
				}),
			).rejects.toThrow(/unbalanced/)

			const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
				SELECT count(*) AS count FROM ledger_entries`
			expect(count).toBe(0n)
		})

		test('a Ledger Transaction with no entries fails at commit', async () => {
			await expect(
				prisma.$transaction(async (tx) => {
					await newTransaction(tx)
				}),
			).rejects.toThrow(/at least two entries/)
		})

		test('a Ledger Transaction with a single entry fails at commit', async () => {
			const { wallet } = await accounts()

			await expect(
				prisma.$transaction(async (tx) => {
					const transactionId = await newTransaction(tx)
					await entry(tx, transactionId, wallet, 'CREDIT', 100)
				}),
			).rejects.toThrow(/at least two entries/)
		})

		test('a balanced Ledger Transaction with two entries commits', async () => {
			const { transactionId } = await commitBalancedTransaction(100)

			const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
				'SELECT count(*) AS count FROM ledger_entries WHERE ledger_transaction_id = $1::uuid',
				transactionId,
			)
			expect(count).toBe(2n)
		})

		test('a balanced Ledger Transaction with three entries commits', async () => {
			const { wallet, clearing } = await accounts()

			await prisma.$transaction(async (tx) => {
				const transactionId = await newTransaction(tx)
				await entry(tx, transactionId, clearing, 'DEBIT', 100)
				await entry(tx, transactionId, wallet, 'CREDIT', 60)
				await entry(tx, transactionId, wallet, 'CREDIT', 40)
			})
		})

		test('the rules hold when several entries are inserted in one statement', async () => {
			const { wallet, clearing } = await accounts()
			const insertTwo = (creditAmount: number) =>
				prisma.$transaction(async (tx) => {
					const transactionId = await newTransaction(tx)
					await tx.$executeRawUnsafe(
						`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
						 VALUES ($1::uuid, $2::uuid, 'DEBIT', 80), ($1::uuid, $3::uuid, 'CREDIT', $4)`,
						transactionId,
						clearing,
						wallet,
						creditAmount,
					)
				})

			await expect(insertTwo(70)).rejects.toThrow(/unbalanced/)
			await insertTwo(80)
		})

		test('the rules hold when entries are inserted across several statements of one transaction', async () => {
			const { wallet, clearing } = await accounts()

			// Balanced only once the last statement ran: the check must wait for COMMIT.
			await prisma.$transaction(async (tx) => {
				const transactionId = await newTransaction(tx)
				await entry(tx, transactionId, clearing, 'DEBIT', 80)
				await entry(tx, transactionId, wallet, 'CREDIT', 30)
				await entry(tx, transactionId, wallet, 'CREDIT', 50)
			})

			await expect(
				prisma.$transaction(async (tx) => {
					const transactionId = await newTransaction(tx)
					await entry(tx, transactionId, clearing, 'DEBIT', 80)
					await entry(tx, transactionId, wallet, 'CREDIT', 30)
					await entry(tx, transactionId, wallet, 'CREDIT', 40)
				}),
			).rejects.toThrow(/unbalanced/)
		})

		test('an entry cannot be added later to an already committed Ledger Transaction', async () => {
			const { transactionId, wallet, clearing } = await commitBalancedTransaction(100)

			await expect(
				prisma.$transaction(async (tx) => {
					await entry(tx, transactionId, wallet, 'CREDIT', 10)
				}),
			).rejects.toThrow(/unbalanced/)

			// A compensating pair keeps the transaction balanced, so it is allowed.
			await prisma.$transaction(async (tx) => {
				await entry(tx, transactionId, wallet, 'CREDIT', 10)
				await entry(tx, transactionId, clearing, 'DEBIT', 10)
			})
		})
	})

	describe('immutability', () => {
		test('UPDATE on a Ledger Entry fails', async () => {
			const { transactionId } = await commitBalancedTransaction()

			await expect(
				prisma.$executeRawUnsafe(
					'UPDATE ledger_entries SET amount = 1 WHERE ledger_transaction_id = $1::uuid',
					transactionId,
				),
			).rejects.toThrow(/append-only/)
		})

		test('DELETE on a Ledger Entry fails', async () => {
			const { transactionId } = await commitBalancedTransaction()

			await expect(
				prisma.$executeRawUnsafe(
					'DELETE FROM ledger_entries WHERE ledger_transaction_id = $1::uuid',
					transactionId,
				),
			).rejects.toThrow(/append-only/)
		})

		test('UPDATE on a Ledger Transaction fails', async () => {
			const { transactionId } = await commitBalancedTransaction()

			await expect(
				prisma.$executeRawUnsafe(
					'UPDATE ledger_transactions SET created_at = now() WHERE id = $1::uuid',
					transactionId,
				),
			).rejects.toThrow(/append-only/)
		})

		test('DELETE on a Ledger Transaction fails', async () => {
			const { transactionId } = await commitBalancedTransaction()

			await expect(
				prisma.$executeRawUnsafe(
					'DELETE FROM ledger_transactions WHERE id = $1::uuid',
					transactionId,
				),
			).rejects.toThrow(/append-only/)
		})

		test('a rejected mutation leaves the committed entries untouched', async () => {
			const { transactionId } = await commitBalancedTransaction(100)

			await prisma
				.$executeRawUnsafe(
					'DELETE FROM ledger_entries WHERE ledger_transaction_id = $1::uuid',
					transactionId,
				)
				.catch(() => undefined)

			const [{ total }] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
				'SELECT sum(amount)::bigint AS total FROM ledger_entries WHERE ledger_transaction_id = $1::uuid',
				transactionId,
			)
			expect(total).toBe(200n)
		})

		test('TRUNCATE stays available so tests can reset between cases', async () => {
			await commitBalancedTransaction()

			await prisma.$executeRawUnsafe('TRUNCATE ledger_entries, ledger_transactions, payments')

			const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
				SELECT count(*) AS count FROM ledger_entries`
			expect(count).toBe(0n)
		})
	})
})
