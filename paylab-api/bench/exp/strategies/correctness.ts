// EXPERIMENT ONLY (T14). The T10 concurrency scenarios, run against every strategy on the benchmark
// database (fresh Wallets), followed by the global invariant check. Exit code 1 on any failure.
// Usage: ts-node -r tsconfig-paths/register bench/exp/strategies/correctness.ts [strategy ...]
import type { Client } from 'pg'
import {
	balanceOf,
	clearingAccount,
	connect,
	createPayments,
	fund,
	invariantViolations,
	prepareSchema,
	walletById,
} from './db'
import { STRATEGIES, type SettleResult, type Strategy, settle } from './strategies'

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

type Ctx = { control: Client; merchantId: string; clearing: string }

async function newWallet(ctx: Ctx, centavos: number): Promise<string> {
	const { rows } = await ctx.control.query(
		"INSERT INTO accounts (kind, merchant_id, currency) VALUES ('WALLET', $1::uuid, 'BRL') RETURNING id",
		[ctx.merchantId],
	)
	if (centavos > 0) {
		await fund(ctx.control, [rows[0].id], centavos)
	}
	return rows[0].id
}

// Runs the given Settlements in parallel, each on its own connection, and returns their results.
async function parallel(
	ctx: Ctx,
	strategy: Strategy,
	jobs: { source: string; destination: string; amount: number; wallet: boolean }[],
) {
	const clients = await Promise.all(jobs.map(() => connect('-c lock_timeout=60000')))
	try {
		const ids = await Promise.all(
			jobs.map((j) =>
				createPayments(ctx.control, ctx.merchantId, j.source, j.destination, j.amount, 1).then(
					(r) => r[0],
				),
			),
		)
		return await Promise.all(
			jobs.map((j, i) =>
				settle(clients[i], strategy, {
					paymentId: ids[i],
					sourceId: j.source,
					destinationId: j.destination,
					amount: j.amount,
					sourceIsWallet: j.wallet,
				}),
			),
		)
	} finally {
		await Promise.all(clients.map((c) => c.end()))
	}
}

const tally = (results: SettleResult[]) => ({
	succeeded: results.filter((r) => r.outcome === 'SUCCEEDED').length,
	failed: results.filter((r) => r.outcome === 'FAILED').length,
	bad: results.filter((r) => r.outcome === 'ERROR' || r.outcome === 'EXHAUSTED'),
	retries: results.reduce((n, r) => n + r.attempts - 1, 0),
	sf: results.reduce((n, r) => n + r.serializationFailures, 0),
	vc: results.reduce((n, r) => n + r.versionConflicts, 0),
	dl: results.reduce((n, r) => n + r.deadlocks, 0),
})

async function run(strategy: Strategy, ctx: Ctx) {
	const failures: string[] = []
	const notes: string[] = []
	const check = (ok: boolean, message: string) => {
		if (!ok) failures.push(message)
	}

	// S1: 50 parallel debits of R$ 10 from a Wallet holding R$ 100.
	{
		const w = await newWallet(ctx, 10_000)
		const d = await newWallet(ctx, 0)
		const t = tally(
			await parallel(
				ctx,
				strategy,
				Array.from({ length: 50 }, () => ({
					source: w,
					destination: d,
					amount: 1_000,
					wallet: true,
				})),
			),
		)
		const balance = await balanceOf(ctx.control, w)
		check(
			t.bad.length === 0,
			`S1: ${t.bad.length} errored or exhausted (${t.bad[0]?.error ?? t.bad[0]?.outcome})`,
		)
		check(
			t.succeeded === 10 && t.failed === 40,
			`S1: ${t.succeeded} succeeded / ${t.failed} failed, expected 10 / 40`,
		)
		check(balance === 0n, `S1: final Balance ${balance}, expected 0`)
		notes.push(`S1 retries=${t.retries} (serialization=${t.sf}, version=${t.vc})`)
	}

	// S2: 25 randomized overspend rounds; conservation and non-negativity.
	{
		let retries = 0
		for (let round = 0; round < 25; round++) {
			const funded = randomInt(20, 80) * 100
			const w = await newWallet(ctx, funded)
			const d = await newWallet(ctx, 0)
			const jobs = Array.from({ length: randomInt(8, 20) }, () => ({
				source: w,
				destination: d,
				amount: randomInt(1, 20) * 100,
				wallet: true,
			}))
			const results = await parallel(ctx, strategy, jobs)
			const t = tally(results)
			retries += t.retries
			const spent = results.reduce(
				(n, r, i) => n + (r.outcome === 'SUCCEEDED' ? jobs[i].amount : 0),
				0,
			)
			const balance = await balanceOf(ctx.control, w)
			check(t.bad.length === 0, `S2 round ${round}: errored or exhausted`)
			check(balance >= 0n, `S2 round ${round}: negative Balance ${balance}`)
			check(
				balance === BigInt(funded - spent),
				`S2 round ${round}: Balance ${balance}, expected ${funded - spent}`,
			)
			check(
				(await balanceOf(ctx.control, d)) === BigInt(spent),
				`S2 round ${round}: destination did not receive what the source sent`,
			)
			// A failed Payment must have been truly unaffordable when decided: at least one success can never leave room for all.
		}
		notes.push(`S2 retries=${retries}`)
	}

	// S3: crossed transfers A->B and B->A in parallel, many rounds; nothing deadlocks or errors.
	{
		let retries = 0
		let deadlocks = 0
		const a = await newWallet(ctx, 500_000)
		const b = await newWallet(ctx, 500_000)
		for (let round = 0; round < 40; round++) {
			const jobs = [
				...Array.from({ length: 6 }, () => ({
					source: a,
					destination: b,
					amount: randomInt(1, 5) * 100,
					wallet: true,
				})),
				...Array.from({ length: 6 }, () => ({
					source: b,
					destination: a,
					amount: randomInt(1, 5) * 100,
					wallet: true,
				})),
			]
			const t = tally(await parallel(ctx, strategy, jobs))
			retries += t.retries
			deadlocks += t.dl
			check(
				t.bad.length === 0,
				`S3 round ${round}: ${t.bad.length} did not resolve (${t.bad[0]?.error ?? t.bad[0]?.outcome})`,
			)
		}
		const total = (await balanceOf(ctx.control, a)) + (await balanceOf(ctx.control, b))
		check(total === 1_000_000n, `S3: money not conserved, ${total} != 1000000`)
		check(deadlocks === 0, `S3: ${deadlocks} deadlocks`)
		notes.push(`S3 retries=${retries} deadlocks=${deadlocks}`)
	}

	// S4: debits racing credits into the same Wallet.
	{
		let retries = 0
		for (let round = 0; round < 10; round++) {
			const w = await newWallet(ctx, 20_000)
			const d = await newWallet(ctx, 0)
			const jobs = [
				...Array.from({ length: 20 }, () => ({
					source: w,
					destination: d,
					amount: 1_000,
					wallet: true,
				})),
				...Array.from({ length: 30 }, () => ({
					source: ctx.clearing,
					destination: w,
					amount: 500,
					wallet: false,
				})),
			]
			const t = tally(await parallel(ctx, strategy, jobs))
			retries += t.retries
			const balance = await balanceOf(ctx.control, w)
			check(
				t.bad.length === 0,
				`S4 round ${round}: errored or exhausted (${t.bad[0]?.error ?? t.bad[0]?.outcome})`,
			)
			check(
				t.succeeded === 50,
				`S4 round ${round}: ${t.succeeded} of 50 succeeded (all are affordable)`,
			)
			check(
				balance === 20_000n + 15_000n - 20_000n,
				`S4 round ${round}: Balance ${balance}, expected 15000`,
			)
		}
		notes.push(`S4 retries=${retries}`)
	}

	const violations = await invariantViolations(ctx.control)
	for (const v of violations) failures.push(`invariant: ${v}`)
	return { failures, notes }
}

async function main() {
	const chosen = (
		process.argv.slice(2).length ? process.argv.slice(2) : [...STRATEGIES]
	) as Strategy[]
	const control = await connect()
	await prepareSchema(control)
	const merchant = (
		await walletById(
			control,
			(
				await control.query("SELECT id FROM accounts WHERE kind='WALLET' LIMIT 1")
			).rows[0].id,
		)
	).merchantId
	const ctx: Ctx = { control, merchantId: merchant, clearing: await clearingAccount(control) }
	let bad = false
	for (const strategy of chosen) {
		const { failures, notes } = await run(strategy, ctx)
		console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} ${strategy}  ${notes.join('  ')}`)
		for (const f of failures.slice(0, 12)) console.log(`   - ${f}`)
		if (failures.length) bad = true
	}
	await control.end()
	process.exit(bad ? 1 : 0)
}

main().catch((e) => {
	console.error(e)
	process.exit(2)
})
