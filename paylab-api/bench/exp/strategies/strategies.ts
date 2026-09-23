// EXPERIMENT ONLY (T14). Alternative Settlement strategies compared with the production baseline
// (ADR 0002). They run the same Settlement-shaped SQL as src/infra/database/repositories/prisma-settlement.ts
// on a plain pg connection; only the concurrency mechanism differs. Never imported from src/.
import type { Client } from 'pg'

export const STRATEGIES = ['nokey', 'forupdate', 'serializable', 'optimistic', 'advisory'] as const
export type Strategy = (typeof STRATEGIES)[number]

export type Settle = {
	paymentId: string
	sourceId: string
	destinationId: string
	amount: number
	/** True when the source is a Wallet (a Balance Consumer); false for the External Clearing Account. */
	sourceIsWallet: boolean
}

export type SettleResult = {
	outcome: 'SUCCEEDED' | 'FAILED' | 'EXHAUSTED' | 'ERROR'
	attempts: number
	/** Aborts that were retried, by cause. */
	serializationFailures: number
	versionConflicts: number
	deadlocks: number
	/** Sum over attempts of the lock-acquire step latency (ms). */
	acquireMs: number
	error?: string
}

export const MAX_ATTEMPTS = 50

const BALANCE_SQL = `SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
	FROM ledger_entries WHERE account_id = $1::uuid`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class VersionConflict extends Error {}

type Attempt = { outcome: 'SUCCEEDED' | 'FAILED'; acquireMs: number }

async function attemptOnce(client: Client, strategy: Strategy, s: Settle): Promise<Attempt> {
	let acquireMs = 0
	await client.query(strategy === 'serializable' ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN')
	try {
		// 1. Claim: CREATED -> PROCESSING (same statement as production).
		const claimed = await client.query(
			`UPDATE payments SET status = 'PROCESSING', updated_at = now()
			 WHERE id = $1::uuid AND status IN ('CREATED', 'PROCESSING') RETURNING amount`,
			[s.paymentId],
		)
		if (claimed.rowCount === 0) {
			throw new Error(`payment ${s.paymentId} could not be claimed`)
		}

		let expectedVersion: string | null = null

		if (s.sourceIsWallet) {
			let balance: bigint
			const timed = async <T>(fn: () => Promise<T>) => {
				const t0 = performance.now()
				const result = await fn()
				acquireMs += performance.now() - t0
				return result
			}

			if (strategy === 'nokey' || strategy === 'forupdate') {
				const mode = strategy === 'nokey' ? 'NO KEY UPDATE' : 'UPDATE'
				await timed(() =>
					client.query(
						`SELECT id FROM accounts WHERE id = $1::uuid AND kind = 'WALLET' FOR ${mode}`,
						[s.sourceId],
					),
				)
			} else if (strategy === 'advisory') {
				await timed(() =>
					client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [s.sourceId]),
				)
			}

			if (strategy === 'optimistic') {
				// Version and Balance from ONE statement, so they share a snapshot; the version is checked last.
				const { rows } = await client.query(
					`SELECT version::text AS version,
					        (SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint
					         FROM ledger_entries WHERE account_id = a.id) AS balance
					 FROM accounts a WHERE id = $1::uuid AND kind = 'WALLET'`,
					[s.sourceId],
				)
				expectedVersion = rows[0].version
				balance = BigInt(rows[0].balance)
			} else {
				const { rows } = await client.query(BALANCE_SQL, [s.sourceId])
				balance = BigInt(rows[0].balance)
			}

			if (balance < BigInt(s.amount)) {
				await client.query(
					`UPDATE payments SET status = 'FAILED', failure_reason = 'INSUFFICIENT_FUNDS', updated_at = now()
					 WHERE id = $1::uuid`,
					[s.paymentId],
				)
				await client.query('COMMIT')
				return { outcome: 'FAILED', acquireMs }
			}
		}

		const lt = await client.query('INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id')
		const ltId = lt.rows[0].id
		await client.query(
			`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
			 VALUES ($1::uuid, $2::uuid, 'DEBIT', $4::bigint), ($1::uuid, $3::uuid, 'CREDIT', $4::bigint)`,
			[ltId, s.sourceId, s.destinationId, s.amount],
		)
		await client.query(
			`UPDATE payments SET status = 'SUCCEEDED', ledger_transaction_id = $2::uuid, updated_at = now()
			 WHERE id = $1::uuid`,
			[s.paymentId, ltId],
		)

		if (strategy === 'optimistic' && s.sourceIsWallet) {
			const t0 = performance.now()
			const bumped = await client.query(
				'UPDATE accounts SET version = version + 1 WHERE id = $1::uuid AND version = $2::bigint',
				[s.sourceId, expectedVersion],
			)
			acquireMs += performance.now() - t0
			if (bumped.rowCount === 0) {
				throw new VersionConflict()
			}
		}

		await client.query('COMMIT')
		return { outcome: 'SUCCEEDED', acquireMs }
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined)
		;(error as { acquireMs?: number }).acquireMs = acquireMs
		throw error
	}
}

/** One Settlement with the strategy's retry loop (only serializable and optimistic ever retry). */
export async function settle(client: Client, strategy: Strategy, s: Settle): Promise<SettleResult> {
	const result: SettleResult = {
		outcome: 'ERROR',
		attempts: 0,
		serializationFailures: 0,
		versionConflicts: 0,
		deadlocks: 0,
		acquireMs: 0,
	}

	while (result.attempts < MAX_ATTEMPTS) {
		result.attempts++
		try {
			const attempt = await attemptOnce(client, strategy, s)
			result.outcome = attempt.outcome
			result.acquireMs += attempt.acquireMs
			return result
		} catch (error) {
			const e = error as { code?: string; message: string; acquireMs?: number }
			result.acquireMs += e.acquireMs ?? 0
			if (error instanceof VersionConflict) {
				result.versionConflicts++
			} else if (e.code === '40001') {
				result.serializationFailures++
			} else if (e.code === '40P01') {
				result.deadlocks++
			} else {
				result.outcome = 'ERROR'
				result.error = `${e.code ?? ''} ${e.message}`
				return result
			}
			// Small randomized backoff, identical for every retrying strategy.
			await sleep(Math.random() * 3)
		}
	}

	result.outcome = 'EXHAUSTED'
	return result
}
