import { Pool, PoolClient } from 'pg'
import { balanceOf, buildSettlementStack, lockWaiters, waitUntil } from '../support/concurrency'
import { createPools } from '../support/database'
import {
	clearingAccountId,
	createFundingLedgerTransaction,
	createMerchant,
	createWallet,
} from '../support/fixtures'

// The lock claim of ADR 0002, checked against PostgreSQL itself: a Settlement holds
// FOR NO KEY UPDATE on the source Wallet, and that must not block credits. Locks
// are held by explicit open transactions and observed through pg_stat_activity,
// so nothing here depends on timing bounds.

let stack: ReturnType<typeof buildSettlementStack>
let pools: Pool[]
let holder: PoolClient
let other: PoolClient
let observer: Pool
let clearingId: string

beforeAll(async () => {
	stack = buildSettlementStack()
	pools = createPools(3)
	observer = pools[2]
	clearingId = await clearingAccountId()
})

beforeEach(async () => {
	holder = await pools[0].connect()
	other = await pools[1].connect()
})

afterEach(async () => {
	// Release anything a failed assertion left open.
	for (const client of [holder, other]) {
		await client.query('ROLLBACK').catch(() => undefined)
		client.release()
	}
})

afterAll(async () => {
	await stack.close()
	await Promise.all(pools.map((pool) => pool.end()))
})

async function hold(mode: 'FOR NO KEY UPDATE' | 'FOR UPDATE', walletId: string) {
	await holder.query('BEGIN')
	await holder.query(`SELECT id FROM accounts WHERE id = $1 ${mode}`, [walletId])
}

// A credit as Settlement writes it: a Ledger Transaction crediting the Wallet.
async function credit(client: PoolClient, walletId: string, lockTimeout: string) {
	await client.query(`SET lock_timeout = '${lockTimeout}'`)
	await client.query('BEGIN')
	try {
		const { rows } = await client.query(
			'INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id',
		)
		await client.query(
			`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
			 VALUES ($1, $2, 'DEBIT', 100), ($1, $3, 'CREDIT', 100)`,
			[rows[0].id, clearingId, walletId],
		)
		await client.query('COMMIT')
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		await client.query('RESET lock_timeout')
	}
}

async function newWallet(funding = 0) {
	const merchantId = await createMerchant()
	const walletId = await createWallet(merchantId)
	if (funding > 0) {
		await createFundingLedgerTransaction(walletId, clearingId, funding)
	}
	return { merchantId, walletId }
}

describe('Row lock mode on the source Wallet (ADR 0002)', () => {
	it('FOR NO KEY UPDATE: a credit into the locked Wallet commits while the lock is held', async () => {
		const { walletId } = await newWallet(1_000)
		await hold('FOR NO KEY UPDATE', walletId)

		// lock_timeout turns a blocked credit into an error instead of a hang.
		await credit(other, walletId, '5s')

		expect(await lockWaiters(observer)).toEqual([])
		await holder.query('ROLLBACK')
		expect(await balanceOf(observer, walletId)).toBe(1_100)
	})

	it('FOR UPDATE (control): the same credit blocks behind the lock until it is released', async () => {
		const { walletId } = await newWallet(1_000)
		await hold('FOR UPDATE', walletId)

		const blocked = credit(other, walletId, '20s')
		let finished = false
		blocked.then(
			() => {
				finished = true
			},
			() => {
				finished = true
			},
		)

		// PostgreSQL itself reports the credit waiting on a lock (the foreign key's FOR KEY SHARE).
		await waitUntil(async () => (await lockWaiters(observer)).length > 0)
		expect(finished).toBe(false)
		expect(await balanceOf(observer, walletId)).toBe(1_000)

		await holder.query('ROLLBACK')
		await blocked
		expect(await balanceOf(observer, walletId)).toBe(1_100)
	})

	it('FOR UPDATE (control): with a short lock_timeout the credit fails with lock_not_available', async () => {
		const { walletId } = await newWallet(1_000)
		await hold('FOR UPDATE', walletId)

		await expect(credit(other, walletId, '300ms')).rejects.toMatchObject({ code: '55P03' })
	})

	it('a second debit of the same Wallet does wait for the first, then runs', async () => {
		const { merchantId, walletId } = await newWallet(1_000)
		const { walletId: destination } = await newWallet()
		const payment = await stack.createPayment(merchantId, walletId, destination, 400)
		await hold('FOR NO KEY UPDATE', walletId)

		const settling = stack.settle(payment)

		await waitUntil(async () => (await lockWaiters(observer)).length > 0)
		expect(await balanceOf(observer, walletId)).toBe(1_000)

		await holder.query('ROLLBACK')
		expect((await settling).status).toBe('SUCCEEDED')
		expect(await balanceOf(observer, walletId)).toBe(600)
	})

	it('a Settlement of another Wallet completes while one Wallet is locked', async () => {
		const { merchantId, walletId: locked } = await newWallet(1_000)
		const { walletId: free } = await newWallet(1_000)
		const { walletId: destination } = await newWallet()
		const payment = await stack.createPayment(merchantId, free, destination, 400)
		await hold('FOR NO KEY UPDATE', locked)

		// If this waited on the held lock the test would hang until its timeout.
		const settled = await stack.settle(payment)

		expect(settled.status).toBe('SUCCEEDED')
		expect(await lockWaiters(observer)).toEqual([])
	})
})
