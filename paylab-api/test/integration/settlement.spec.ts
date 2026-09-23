import { randomUUID } from 'node:crypto'
import { Either } from '@/core/either'
import { GetAccountBalanceUseCase } from '@/domain/paylab/application/use-cases/get-account-balance'
import { SettlePaymentUseCase } from '@/domain/paylab/application/use-cases/settle-payment'
import { Account } from '@/domain/paylab/enterprise/entities/account'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { Amount } from '@/domain/paylab/enterprise/entities/value-objects/amount'
import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaAccountsRepository } from '@/infra/database/repositories/prisma-accounts-repository'
import { PrismaPaymentsRepository } from '@/infra/database/repositories/prisma-payments-repository'
import { PrismaSettlement } from '@/infra/database/repositories/prisma-settlement'
import { Pool } from 'pg'
import { createPools } from '../support/database'
import {
	clearingAccountId,
	createFundingLedgerTransaction,
	createMerchant,
	createWallet,
	one,
} from '../support/fixtures'

const prismaService = new PrismaService()
const accounts = new PrismaAccountsRepository(prismaService)
const payments = new PrismaPaymentsRepository(prismaService)
const settlement = new PrismaSettlement(prismaService)
const settlePayment = new SettlePaymentUseCase(payments, settlement)
const getAccountBalance = new GetAccountBalanceUseCase(accounts)

afterAll(async () => {
	await prismaService.$disconnect()
})

function unwrap<L, R>(result: Either<L, R>): R {
	if (result.isLeft()) {
		throw result.value
	}
	return result.value
}

async function loadAccount(id: string): Promise<Account> {
	const account = await accounts.findById(id)
	if (!account) {
		throw new Error(`account ${id} not found`)
	}
	return account
}

// Persists a CREATED Payment between two existing Accounts.
async function createPayment(
	merchantId: string,
	sourceId: string,
	destinationId: string,
	centavos: number,
) {
	const payment = unwrap(
		Payment.create({
			merchantId,
			source: await loadAccount(sourceId),
			destination: await loadAccount(destinationId),
			amount: unwrap(Amount.create(centavos)),
			idempotencyKey: randomUUID(),
			requestFingerprint: 'fingerprint',
		}),
	)
	await payments.create(payment)
	return payment
}

async function fundedWallet(centavos: number) {
	const merchantId = await createMerchant()
	const walletId = await createWallet(merchantId)
	const clearingId = await clearingAccountId()
	if (centavos > 0) {
		await createFundingLedgerTransaction(walletId, clearingId, centavos)
	}
	return { merchantId, walletId, clearingId }
}

async function ledgerTransactionCount() {
	const { n } = await one<{ n: bigint }>('SELECT count(*) AS n FROM ledger_transactions')
	return Number(n)
}

async function balanceOf(accountId: string) {
	return unwrap(await getAccountBalance.execute({ accountId })).balance
}

function settle(payment: Payment) {
	return settlePayment.execute({ paymentId: payment.id.toString() })
}

describe('Settlement', () => {
	it('settles a Wallet Payment with enough funds: one Ledger Transaction, debit source, credit destination', async () => {
		const { merchantId, walletId } = await fundedWallet(1000)
		const destinationId = await createWallet(merchantId)
		const payment = await createPayment(merchantId, walletId, destinationId, 300)

		const settled = unwrap(await settle(payment)).payment

		expect(settled.status).toBe('SUCCEEDED')
		expect(settled.failureReason).toBeUndefined()
		// One for the funding, one for the Settlement.
		expect(await ledgerTransactionCount()).toBe(2)

		const entries = await prismaService.$queryRaw<
			{ account_id: string; direction: string; amount: bigint }[]
		>`SELECT account_id, direction, amount FROM ledger_entries
		  WHERE ledger_transaction_id = ${settled.ledgerTransactionId?.toString()}::uuid
		  ORDER BY direction`
		expect(entries).toEqual([
			// The enum sorts DEBIT before CREDIT.
			{ account_id: walletId, direction: 'DEBIT', amount: 300n },
			{ account_id: destinationId, direction: 'CREDIT', amount: 300n },
		])
		expect(await balanceOf(walletId)).toBe(700)
		expect(await balanceOf(destinationId)).toBe(300)

		const persisted = await payments.findById(payment.id.toString())
		expect(persisted?.status).toBe('SUCCEEDED')
		expect(persisted?.ledgerTransactionId?.toString()).toBe(settled.ledgerTransactionId?.toString())
	})

	it('fails a Payment with INSUFFICIENT_FUNDS and writes no Ledger Transaction', async () => {
		const { merchantId, walletId } = await fundedWallet(1000)
		const destinationId = await createWallet(merchantId)
		const payment = await createPayment(merchantId, walletId, destinationId, 1001)

		const settled = unwrap(await settle(payment)).payment

		expect(settled.status).toBe('FAILED')
		expect(settled.failureReason).toBe('INSUFFICIENT_FUNDS')
		expect(settled.ledgerTransactionId).toBeUndefined()
		expect(await ledgerTransactionCount()).toBe(1)
		expect(await balanceOf(walletId)).toBe(1000)
		expect(await balanceOf(destinationId)).toBe(0)

		const row = await one<{
			status: string
			failure_reason: string
			ledger_transaction_id: string | null
		}>(
			'SELECT status, failure_reason, ledger_transaction_id FROM payments WHERE id = $1::uuid',
			payment.id.toString(),
		)
		expect(row).toEqual({
			status: 'FAILED',
			failure_reason: 'INSUFFICIENT_FUNDS',
			ledger_transaction_id: null,
		})
	})

	it('succeeds when the funds are exactly enough and leaves a zero Balance', async () => {
		const { merchantId, walletId } = await fundedWallet(1000)
		const destinationId = await createWallet(merchantId)
		const payment = await createPayment(merchantId, walletId, destinationId, 1000)

		const settled = unwrap(await settle(payment)).payment

		expect(settled.status).toBe('SUCCEEDED')
		expect(await balanceOf(walletId)).toBe(0)
		expect(await balanceOf(destinationId)).toBe(1000)
	})

	it('settles a clearing-sourced Payment without a funds check', async () => {
		const { merchantId, walletId, clearingId } = await fundedWallet(0)
		const payment = await createPayment(merchantId, clearingId, walletId, 500)

		const settled = unwrap(await settle(payment)).payment

		expect(settled.status).toBe('SUCCEEDED')
		expect(await balanceOf(walletId)).toBe(500)
		// The clearing Account goes negative by design: it stands for the outside world.
		expect(await balanceOf(clearingId)).toBe(-500)
	})

	it('applies the funds check to a Wallet to clearing withdrawal', async () => {
		const { merchantId, walletId, clearingId } = await fundedWallet(1000)

		const tooMuch = await createPayment(merchantId, walletId, clearingId, 1500)
		const failed = unwrap(await settle(tooMuch)).payment
		expect(failed.status).toBe('FAILED')
		expect(failed.failureReason).toBe('INSUFFICIENT_FUNDS')
		expect(await balanceOf(walletId)).toBe(1000)

		const affordable = await createPayment(merchantId, walletId, clearingId, 1000)
		const succeeded = unwrap(await settle(affordable)).payment
		expect(succeeded.status).toBe('SUCCEEDED')
		expect(await balanceOf(walletId)).toBe(0)
	})

	it.each([
		['SUCCEEDED', 100],
		['FAILED', 5000],
	] as const)('rejects settling a %s Payment and changes nothing', async (outcome, centavos) => {
		const { merchantId, walletId } = await fundedWallet(1000)
		const destinationId = await createWallet(merchantId)
		const payment = await createPayment(merchantId, walletId, destinationId, centavos)
		unwrap(await settle(payment))
		const transactionsBefore = await ledgerTransactionCount()
		const balanceBefore = await balanceOf(walletId)

		const again = await settle(payment)

		expect(again.isLeft()).toBe(true)
		expect(await ledgerTransactionCount()).toBe(transactionsBefore)
		expect(await balanceOf(walletId)).toBe(balanceBefore)
		expect((await payments.findById(payment.id.toString()))?.status).toBe(outcome)
	})

	it('reports an unknown Payment as not found', async () => {
		const result = await settlePayment.execute({ paymentId: randomUUID() })

		expect(result.isLeft()).toBe(true)
	})

	it('resumes a Payment already in PROCESSING (crash recovery)', async () => {
		const { merchantId, walletId } = await fundedWallet(1000)
		const destinationId = await createWallet(merchantId)
		const payment = await createPayment(merchantId, walletId, destinationId, 200)
		await one(
			"UPDATE payments SET status = 'PROCESSING' WHERE id = $1::uuid RETURNING id",
			payment.id.toString(),
		)

		const settled = unwrap(await settle(payment)).payment

		expect(settled.status).toBe('SUCCEEDED')
	})

	it('settles against a Balance beyond the safe integer range without losing precision', async () => {
		const merchantId = await createMerchant()
		const walletId = await createWallet(merchantId)
		const destinationId = await createWallet(merchantId)
		const clearingId = await clearingAccountId()
		const huge = 2n ** 60n
		await prismaService.$transaction(async (tx) => {
			const [{ id }] = await tx.$queryRaw<
				{ id: string }[]
			>`INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id`
			await tx.$executeRaw`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
				VALUES (${id}::uuid, ${clearingId}::uuid, 'DEBIT', ${huge}),
				       (${id}::uuid, ${walletId}::uuid, 'CREDIT', ${huge})`
		})
		const payment = await createPayment(merchantId, walletId, destinationId, 1)

		const settled = unwrap(await settle(payment)).payment

		expect(settled.status).toBe('SUCCEEDED')
		const { balance } = await one<{ balance: bigint }>(
			`SELECT sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END)::bigint AS balance
			 FROM ledger_entries WHERE account_id = $1::uuid`,
			walletId,
		)
		expect(balance).toBe(huge - 1n)
	})
})

describe('Settlement locking (ADR 0002)', () => {
	let pools: Pool[]

	beforeEach(() => {
		pools = createPools(1)
	})

	afterEach(async () => {
		await Promise.all(pools.map((pool) => pool.end()))
	})

	const pending = Symbol('pending')
	const orPending = (promise: Promise<unknown>, ms: number) =>
		Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(pending), ms))])

	it('makes a debit wait for the source Wallet lock, while a credit to that Wallet is not blocked', async () => {
		const { merchantId, walletId, clearingId } = await fundedWallet(1000)
		const otherWalletId = await createWallet(merchantId)
		const debit = await createPayment(merchantId, walletId, otherWalletId, 100)
		const credit = await createPayment(merchantId, clearingId, walletId, 50)
		const holder = await pools[0].connect()

		try {
			// Stands in for an in-flight debit Settlement on the same source Wallet.
			await holder.query('BEGIN')
			await holder.query('SELECT id FROM accounts WHERE id = $1 FOR NO KEY UPDATE', [walletId])

			expect(await orPending(settle(credit), 5000)).not.toBe(pending)

			const debitSettlement = settle(debit)
			expect(await orPending(debitSettlement, 500)).toBe(pending)

			await holder.query('COMMIT')
			expect(unwrap(await debitSettlement).payment.status).toBe('SUCCEEDED')
		} finally {
			await holder.query('ROLLBACK').catch(() => undefined)
			holder.release()
		}
	})

	it('takes no lock for a clearing-sourced Settlement', async () => {
		const { merchantId, walletId, clearingId } = await fundedWallet(0)
		const payment = await createPayment(merchantId, clearingId, walletId, 50)
		const holder = await pools[0].connect()

		try {
			await holder.query('BEGIN')
			await holder.query('SELECT id FROM accounts WHERE id = $1 FOR NO KEY UPDATE', [clearingId])

			expect(await orPending(settle(payment), 5000)).not.toBe(pending)
		} finally {
			await holder.query('ROLLBACK').catch(() => undefined)
			holder.release()
		}
	})
})

describe('Balance query', () => {
	it('is zero for a new Wallet', async () => {
		const merchantId = await createMerchant()
		const walletId = await createWallet(merchantId)

		expect(await balanceOf(walletId)).toBe(0)
	})

	it('equals credits minus debits', async () => {
		const { merchantId, walletId } = await fundedWallet(1000)
		const destinationId = await createWallet(merchantId)
		unwrap(await settle(await createPayment(merchantId, walletId, destinationId, 400)))

		expect(await balanceOf(walletId)).toBe(600)
		expect(await balanceOf(destinationId)).toBe(400)
	})

	it('reports an unknown Account as not found', async () => {
		const result = await getAccountBalance.execute({ accountId: randomUUID() })

		expect(result.isLeft()).toBe(true)
	})
})
