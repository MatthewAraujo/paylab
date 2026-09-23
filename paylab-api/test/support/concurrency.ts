import { randomUUID } from 'node:crypto'
import { Either } from '@/core/either'
import { SettlePaymentUseCase } from '@/domain/paylab/application/use-cases/settle-payment'
import { Account } from '@/domain/paylab/enterprise/entities/account'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { Amount } from '@/domain/paylab/enterprise/entities/value-objects/amount'
import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaAccountsRepository } from '@/infra/database/repositories/prisma-accounts-repository'
import { PrismaPaymentsRepository } from '@/infra/database/repositories/prisma-payments-repository'
import { PrismaSettlement } from '@/infra/database/repositories/prisma-settlement'
import { Pool } from 'pg'

// Helpers for the concurrency layer: a Prisma pool wide enough that every parallel
// Settlement really holds its own connection, and observers of PostgreSQL's own
// lock state so tests assert on facts, not on timing.

export const POOL_SIZE = 64

export function widePoolUrl() {
	const url = new URL(process.env.DATABASE_URL as string)
	url.searchParams.set('connection_limit', String(POOL_SIZE))
	url.searchParams.set('pool_timeout', '60')
	return url.toString()
}

export function unwrap<L, R>(result: Either<L, R>): R {
	if (result.isLeft()) {
		throw result.value
	}
	return result.value
}

// The real Settlement stack on its own wide connection pool.
export function buildSettlementStack() {
	const prismaService = new PrismaService({ datasourceUrl: widePoolUrl() })
	const accounts = new PrismaAccountsRepository(prismaService)
	const payments = new PrismaPaymentsRepository(prismaService)
	const settlement = new PrismaSettlement(prismaService)
	const settlePayment = new SettlePaymentUseCase(payments, settlement)

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

	async function settle(payment: Payment) {
		return unwrap(await settlePayment.execute({ paymentId: payment.id.toString() })).payment
	}

	return {
		createPayment,
		settle,
		close: () => prismaService.$disconnect(),
	}
}

export async function balanceOf(pool: Pool, accountId: string): Promise<number> {
	const { rows } = await pool.query(
		`SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
		 FROM ledger_entries WHERE account_id = $1`,
		[accountId],
	)
	return Number(rows[0].balance)
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// Integer in [min, max], inclusive.
export function randomInt(min: number, max: number) {
	return min + Math.floor(Math.random() * (max - min + 1))
}

// Backends other than the caller currently waiting on a heavyweight lock (row
// lock, transaction id). Read from pg_stat_activity, so it is a fact about
// PostgreSQL's state rather than a timing guess.
export async function lockWaiters(pool: Pool) {
	const { rows } = await pool.query<{ pid: number; query: string }>(
		`SELECT pid, query FROM pg_stat_activity
		 WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
	)
	return rows
}

export async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (await condition()) {
			return
		}
		await sleep(10)
	}
	throw new Error(`condition not met within ${timeoutMs}ms`)
}

// Samples lock waiters in the background until stopped; returns every sighting.
export function startLockWaitSampler(pool: Pool, intervalMs = 3) {
	let running = true
	const sightings: { pid: number; query: string }[] = []
	const loop = (async () => {
		while (running) {
			sightings.push(...(await lockWaiters(pool)))
			await sleep(intervalMs)
		}
	})()

	return async () => {
		running = false
		await loop
		return sightings
	}
}
