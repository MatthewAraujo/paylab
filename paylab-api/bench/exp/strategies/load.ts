// EXPERIMENT ONLY (T14). Closed-loop load driver: N virtual clients, one connection each, run
// Settlements with a strategy for a fixed window and print one JSON line per run.
// Usage: ts-node -r tsconfig-paths/register bench/exp/strategies/load.ts \
//   --shape H|W|M --clients 16 --strategies nokey,serializable --rep 1 [--duration 12] [--warmup 2] [--sync on|off]
import type { Client } from 'pg'
import {
	HOT_WALLET,
	type Wallet,
	clearingAccount,
	connect,
	fund,
	prepareSchema,
	walletById,
	wallets,
} from './db'
import { type Settle, type SettleResult, type Strategy, settle } from './strategies'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2)
	args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const shape = args.get('shape') as 'H' | 'W' | 'M'
const clientsN = Number(args.get('clients') ?? 16)
const strategies = (args.get('strategies') ?? 'nokey').split(',') as Strategy[]
const durationS = Number(args.get('duration') ?? 12)
const warmupS = Number(args.get('warmup') ?? 2)
const sync = args.get('sync') ?? 'on'
const rep = Number(args.get('rep') ?? 1)
const AMOUNT = 100
const BATCH = 50

type Pick = {
	source: string
	destination: string
	merchantId: string
	wallet: boolean
	kind: 'debit' | 'credit'
}

const pct = (sorted: number[], p: number) =>
	sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

async function main() {
	const control = await connect()
	await prepareSchema(control)
	const all = await wallets(control)
	const hot = await walletById(control, HOT_WALLET)
	const clearing = await clearingAccount(control)
	await fund(
		control,
		all.map((w) => w.id),
		100_000_000,
	)
	const others = all.filter((w) => w.id !== hot.id)
	const uniform = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

	function pick(): Pick {
		if (shape === 'H') {
			const d = uniform(others)
			return {
				source: hot.id,
				destination: d.id,
				merchantId: hot.merchantId,
				wallet: true,
				kind: 'debit',
			}
		}
		if (shape === 'M') {
			if (Math.random() < 0.5) {
				const d = uniform(others)
				return {
					source: hot.id,
					destination: d.id,
					merchantId: hot.merchantId,
					wallet: true,
					kind: 'debit',
				}
			}
			return {
				source: clearing,
				destination: hot.id,
				merchantId: hot.merchantId,
				wallet: false,
				kind: 'credit',
			}
		}
		let s: Wallet
		let d: Wallet
		do {
			s = uniform(all)
			d = uniform(all)
		} while (s.id === d.id)
		return {
			source: s.id,
			destination: d.id,
			merchantId: s.merchantId,
			wallet: true,
			kind: 'debit',
		}
	}

	async function createBatch(c: Client, picks: Pick[]): Promise<string[]> {
		const { rows } = await c.query(
			`INSERT INTO payments (id, merchant_id, source_account_id, destination_account_id, amount, currency, status, idempotency_key, request_fingerprint)
			 SELECT g, m, s, d, $4::bigint, 'BRL', 'CREATED', g::text, 'fp'
			 FROM (SELECT gen_random_uuid() AS g, m, s, d FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS t(m, s, d)) x
			 RETURNING id`,
			[
				picks.map((p) => p.merchantId),
				picks.map((p) => p.source),
				picks.map((p) => p.destination),
				AMOUNT,
			],
		)
		return rows.map((r) => r.id)
	}

	for (const strategy of strategies) {
		const options = `-c lock_timeout=60000${sync === 'off' ? ' -c synchronous_commit=off' : ''}`
		const clients = await Promise.all(Array.from({ length: clientsN }, () => connect(options)))
		const sampler = await connect()
		const startAt = performance.now()
		const winStart = startAt + warmupS * 1000
		const winEnd = winStart + durationS * 1000
		let stop = false

		const records: (SettleResult & { kind: 'debit' | 'credit'; ms: number })[] = []
		const waiters: number[] = []

		const stat = async () =>
			(
				await sampler.query(
					'SELECT xact_commit, xact_rollback, deadlocks FROM pg_stat_database WHERE datname = current_database()',
				)
			).rows[0]
		let before: Record<string, string> | undefined

		const sample = (async () => {
			let tookBefore = false
			while (!stop) {
				const now = performance.now()
				if (now >= winStart) {
					if (!tookBefore) {
						before = await stat()
						tookBefore = true
					}
					const r = await sampler.query(
						`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
					)
					waiters.push(r.rows[0].n)
				}
				await new Promise((res) => setTimeout(res, 25))
			}
		})()

		await Promise.all(
			clients.map(async (c) => {
				while (!stop) {
					const picks = Array.from({ length: BATCH }, pick)
					const ids = await createBatch(c, picks)
					for (let i = 0; i < picks.length && !stop; i++) {
						const p = picks[i]
						const job: Settle = {
							paymentId: ids[i],
							sourceId: p.source,
							destinationId: p.destination,
							amount: AMOUNT,
							sourceIsWallet: p.wallet,
						}
						const t0 = performance.now()
						const result = await settle(c, strategy, job)
						const t1 = performance.now()
						if (t0 >= winStart && t1 <= winEnd)
							records.push({ ...result, kind: p.kind, ms: t1 - t0 })
						if (t1 >= winEnd) stop = true
					}
				}
			}),
		)
		stop = true
		await sample
		const after = await stat()

		const ok = records.filter((r) => r.outcome === 'SUCCEEDED')
		const lat = (rs: typeof records) => rs.map((r) => r.ms).sort((a, b) => a - b)
		const l = lat(ok)
		const ld = lat(ok.filter((r) => r.kind === 'debit'))
		const lc = lat(ok.filter((r) => r.kind === 'credit'))
		const acq = ok
			.filter((r) => r.kind === 'debit' && r.attempts >= 1)
			.map((r) => r.acquireMs)
			.sort((a, b) => a - b)
		const sum = (f: (r: (typeof records)[number]) => number) =>
			records.reduce((n, r) => n + f(r), 0)
		const line = {
			shape,
			clients: clientsN,
			strategy,
			rep,
			sync,
			windowS: durationS,
			tps: round(ok.length / durationS, 1),
			debitTps: round(ld.length / durationS, 1),
			creditTps: round(lc.length / durationS, 1),
			p50: round(pct(l, 50)),
			p95: round(pct(l, 95)),
			p99: round(pct(l, 99)),
			debitP50: round(pct(ld, 50)),
			debitP95: round(pct(ld, 95)),
			debitP99: round(pct(ld, 99)),
			creditP50: round(pct(lc, 50)),
			creditP95: round(pct(lc, 95)),
			creditP99: round(pct(lc, 99)),
			attemptsPerSuccess: round(sum((r) => r.attempts) / Math.max(1, ok.length), 2),
			serializationFailures: sum((r) => r.serializationFailures),
			versionConflicts: sum((r) => r.versionConflicts),
			deadlocks: sum((r) => r.deadlocks),
			exhausted: records.filter((r) => r.outcome === 'EXHAUSTED').length,
			errors: records.filter((r) => r.outcome === 'ERROR').length,
			failedPayments: records.filter((r) => r.outcome === 'FAILED').length,
			acquireMeanMs: round(acq.reduce((n, v) => n + v, 0) / Math.max(1, acq.length)),
			acquireP95Ms: round(pct(acq, 95)),
			avgLockWaiters: round(waiters.reduce((n, v) => n + v, 0) / Math.max(1, waiters.length)),
			pgRollbacks: before ? Number(after.xact_rollback) - Number(before.xact_rollback) : null,
			pgDeadlocks: before ? Number(after.deadlocks) - Number(before.deadlocks) : null,
			samples: waiters.length,
		}
		console.log(JSON.stringify(line))

		await Promise.all([...clients, sampler].map((c) => c.end()))
	}
	await control.end()
}

main().catch((e) => {
	console.error(e)
	process.exit(2)
})
