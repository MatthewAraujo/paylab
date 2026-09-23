import { prisma } from './database'

// Global invariants of the ledger, checked with plain SQL after every integration
// and concurrency test (US-82). They are the safety net behind the database
// triggers and Settlement: if any code path breaks the books, the test that did
// it fails right there.
//
//   1. The sum of ALL ledger entries is zero (debits positive, credits negative).
//   2. No Wallet has a negative Balance (credits minus debits).
//
// Both queries are single aggregates over the ledger, cheap enough to run after every test.

export async function getInvariantViolations(): Promise<string[]> {
	const violations: string[] = []

	const [{ net }] = await prisma.$queryRaw<{ net: bigint }[]>`
		SELECT coalesce(sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)::bigint AS net
		FROM ledger_entries`
	if (net !== 0n) {
		violations.push(`sum of all ledger entries is ${net}, expected 0`)
	}

	const negativeWallets = await prisma.$queryRaw<{ id: string; balance: bigint }[]>`
		SELECT a.id, sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END)::bigint AS balance
		FROM accounts a
		JOIN ledger_entries e ON e.account_id = a.id
		WHERE a.kind = 'WALLET'
		GROUP BY a.id
		HAVING sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END) < 0`
	for (const wallet of negativeWallets) {
		violations.push(`Wallet ${wallet.id} has a negative Balance of ${wallet.balance}`)
	}

	return violations
}

export async function assertGlobalInvariants() {
	const violations = await getInvariantViolations()

	if (violations.length > 0) {
		throw new Error(`Global ledger invariants violated:\n- ${violations.join('\n- ')}`)
	}
}
