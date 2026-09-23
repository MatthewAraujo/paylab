import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { Pool } from 'pg'
import {
	balanceOf,
	buildSettlementStack,
	randomInt,
	startLockWaitSampler,
} from '../support/concurrency'
import { createPools } from '../support/database'
import {
	clearingAccountId,
	createFundingLedgerTransaction,
	createMerchant,
	createWallet,
	one,
} from '../support/fixtures'

// Real parallel Settlements against PostgreSQL (US-47..52). Assertions are on
// final database state and counts only, never on the order of interleavings.
// Rounds are randomized and repeated so that a broken lock fails reproducibly.

const ROUNDS = 25

let stack: ReturnType<typeof buildSettlementStack>
let observer: Pool
let clearingId: string

beforeAll(async () => {
	stack = buildSettlementStack()
	;[observer] = createPools(1)
	clearingId = await clearingAccountId()
})

afterAll(async () => {
	await stack.close()
	await observer.end()
})

async function fundedWallet(merchantId: string, centavos: number) {
	const walletId = await createWallet(merchantId)
	if (centavos > 0) {
		await createFundingLedgerTransaction(walletId, clearingId, centavos)
	}
	return walletId
}

async function count(sql: string) {
	const { n } = await one<{ n: bigint }>(sql)
	return Number(n)
}

describe('Concurrent Settlement', () => {
	it('50 parallel debits of R$ 10 from a Wallet holding R$ 100: exactly 10 succeed, 40 fail, Balance zero', async () => {
		const merchantId = await createMerchant()
		const source = await fundedWallet(merchantId, 10_000)
		const destination = await createWallet(merchantId)
		const payments: Payment[] = []
		for (let i = 0; i < 50; i++) {
			payments.push(await stack.createPayment(merchantId, source, destination, 1_000))
		}

		const settled = await Promise.all(payments.map((payment) => stack.settle(payment)))

		expect(settled.filter((p) => p.status === 'SUCCEEDED')).toHaveLength(10)
		const failed = settled.filter((p) => p.status === 'FAILED')
		expect(failed).toHaveLength(40)
		expect(failed.every((p) => p.failureReason === 'INSUFFICIENT_FUNDS')).toBe(true)
		expect(await balanceOf(observer, source)).toBe(0)
		expect(await balanceOf(observer, destination)).toBe(10_000)
		// One funding plus ten settlements: failed Payments write nothing to the ledger.
		expect(await count('SELECT count(*) AS n FROM ledger_transactions')).toBe(11)
	})

	it(`randomized rounds never overspend (${ROUNDS} rounds)`, async () => {
		const merchantId = await createMerchant()

		for (let round = 0; round < ROUNDS; round++) {
			const amount = randomInt(1, 1_000)
			const affordable = randomInt(0, 12)
			const attempts = affordable + randomInt(1, 25)
			const funding = affordable * amount + randomInt(0, amount - 1)
			const source = await fundedWallet(merchantId, funding)
			const destination = await createWallet(merchantId)
			const payments: Payment[] = []
			for (let i = 0; i < attempts; i++) {
				payments.push(await stack.createPayment(merchantId, source, destination, amount))
			}

			const settled = await Promise.all(payments.map((payment) => stack.settle(payment)))

			const succeeded = settled.filter((p) => p.status === 'SUCCEEDED').length
			const context = `round ${round}: amount=${amount} funding=${funding} attempts=${attempts}`
			expect(succeeded, context).toBe(Math.min(attempts, affordable))
			expect(await balanceOf(observer, source), context).toBe(funding - succeeded * amount)
			expect(await balanceOf(observer, destination), context).toBe(succeeded * amount)
		}
	})

	it('Settlements from different Wallets never wait on each other', async () => {
		const merchantId = await createMerchant()
		const wallets = 40
		const sources: string[] = []
		const destinations: string[] = []
		const payments: Payment[] = []
		for (let i = 0; i < wallets; i++) {
			sources.push(await fundedWallet(merchantId, 1_000))
			destinations.push(await createWallet(merchantId))
			payments.push(await stack.createPayment(merchantId, sources[i], destinations[i], 100))
		}

		const stopSampling = startLockWaitSampler(observer)
		const settled = await Promise.all(payments.map((payment) => stack.settle(payment)))
		const sightings = await stopSampling()

		expect(settled.every((p) => p.status === 'SUCCEEDED')).toBe(true)
		// One debit per Wallet and disjoint destinations: nothing shares a lock, so
		// PostgreSQL must never have shown a backend waiting on one. The held-lock
		// test in lock-modes.spec.ts proves the same deterministically.
		expect(sightings).toEqual([])
		for (let i = 0; i < wallets; i++) {
			expect(await balanceOf(observer, sources[i])).toBe(900)
			expect(await balanceOf(observer, destinations[i])).toBe(100)
		}
	})

	it('crossed transfers A->B and B->A never deadlock and all resolve (many rounds)', async () => {
		const merchantId = await createMerchant()
		const rounds = 40
		const perDirection = 8

		for (let round = 0; round < rounds; round++) {
			const a = await fundedWallet(merchantId, 5_000)
			const b = await fundedWallet(merchantId, 5_000)
			const payments: Payment[] = []
			for (let i = 0; i < perDirection; i++) {
				payments.push(await stack.createPayment(merchantId, a, b, randomInt(1, 900)))
				payments.push(await stack.createPayment(merchantId, b, a, randomInt(1, 900)))
			}

			// Promise.all rejects on a deadlock error (SQLSTATE 40P01), failing the round.
			const settled = await Promise.all(payments.map((payment) => stack.settle(payment)))

			expect(
				settled.every((p) => p.status === 'SUCCEEDED' || p.status === 'FAILED'),
				`round ${round}`,
			).toBe(true)
			// Money only moves between the two Wallets: their total is unchanged.
			expect(
				(await balanceOf(observer, a)) + (await balanceOf(observer, b)),
				`round ${round}`,
			).toBe(10_000)
		}

		expect(
			await count(`SELECT count(*) AS n FROM payments WHERE status NOT IN ('SUCCEEDED', 'FAILED')`),
		).toBe(0)
	})

	it('credits arriving during a stream of debits are all applied', async () => {
		const merchantId = await createMerchant()
		const wallet = await fundedWallet(merchantId, 1_000)
		const other = await createWallet(merchantId)
		const debits: Payment[] = []
		for (let i = 0; i < 30; i++) {
			debits.push(await stack.createPayment(merchantId, wallet, other, 100))
		}
		const credits: Payment[] = []
		for (let i = 0; i < 30; i++) {
			credits.push(await stack.createPayment(merchantId, clearingId, wallet, 100))
		}

		const settled = await Promise.all(
			[...debits, ...credits].sort(() => Math.random() - 0.5).map((p) => stack.settle(p)),
		)

		const debitIds = new Set(debits.map((p) => p.id.toString()))
		const succeededDebits = settled.filter(
			(p) => debitIds.has(p.id.toString()) && p.status === 'SUCCEEDED',
		).length
		// Every credit succeeds: a clearing source runs no funds check.
		expect(
			settled.filter((p) => !debitIds.has(p.id.toString()) && p.status === 'SUCCEEDED'),
		).toHaveLength(30)
		expect(await balanceOf(observer, wallet)).toBe(1_000 + 3_000 - succeededDebits * 100)
		expect(await balanceOf(observer, other)).toBe(succeededDebits * 100)
	})
})
