import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaReadQueriesRepository } from '@/infra/database/repositories/prisma-read-queries-repository'
import { prisma } from '../support/database'
import { createMerchant, createWallet } from '../support/fixtures'
import { insertCreditAt, insertPaymentAt, insertWalletAt } from '../support/reads'

// The Payment list query is assembled from optional predicates with positional
// parameters. Every combination of filters must return exactly what the same
// filters mean in plain code, keyset position included.

const repository = new PrismaReadQueriesRepository(prisma as unknown as PrismaService)
const base = Date.parse('2026-09-01T00:00:00.000Z')
const at = (minute: number) => new Date(base + minute * 60_000)

type Status = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

describe('Merchant read queries (integration)', () => {
	async function paymentFixture() {
		const merchantId = await createMerchant('Reads')
		const otherMerchantId = await createMerchant('Other')
		const walletA = await createWallet(merchantId)
		const walletB = await createWallet(merchantId)
		const foreign = await createWallet(otherMerchantId)
		const statuses: Status[] = ['SUCCEEDED', 'FAILED', 'CREATED']
		const rows: {
			id: string
			source: string
			destination: string
			status: Status
			createdAt: Date
		}[] = []

		// 18 Payments, minutes repeated so several rows share a timestamp.
		for (let i = 0; i < 18; i++) {
			const source = i % 2 === 0 ? walletA : walletB
			const destination = i % 2 === 0 ? walletB : walletA
			const status = statuses[i % 3]
			const createdAt = at(Math.floor(i / 3))
			const id = await insertPaymentAt({
				merchantId,
				sourceAccountId: source,
				destinationAccountId: destination,
				amount: 100 + i,
				status,
				at: createdAt,
			})
			rows.push({ id, source, destination, status, createdAt })
		}
		// Another Merchant's Payment touching the same instant: never visible.
		await insertPaymentAt({
			merchantId: otherMerchantId,
			sourceAccountId: foreign,
			destinationAccountId: walletA,
			amount: 1,
			status: 'SUCCEEDED',
			at: at(2),
		})

		return { merchantId, walletA, rows }
	}

	const newestFirst = <T extends { id: string; createdAt: Date }>(rows: T[]) =>
		[...rows].sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
		)

	test('every combination of Payment list filters and cursor matches the plain-code result', async () => {
		const { merchantId, walletA, rows } = await paymentFixture()
		const ordered = newestFirst(rows)
		const cursorRow = ordered[7]

		for (let mask = 0; mask < 32; mask++) {
			const filter = {
				accountId: mask & 1 ? walletA : undefined,
				status: mask & 2 ? 'FAILED' : undefined,
				from: mask & 4 ? at(1) : undefined,
				to: mask & 8 ? at(5) : undefined,
				after: mask & 16 ? { createdAt: cursorRow.createdAt, id: cursorRow.id } : undefined,
			}

			const expected = ordered
				.filter(
					(row) =>
						(!filter.accountId ||
							row.source === filter.accountId ||
							row.destination === filter.accountId) &&
						(!filter.status || row.status === filter.status) &&
						(!filter.from || row.createdAt >= filter.from) &&
						(!filter.to || row.createdAt < filter.to) &&
						(!filter.after ||
							row.createdAt < filter.after.createdAt ||
							(row.createdAt.getTime() === filter.after.createdAt.getTime() &&
								row.id < filter.after.id)),
				)
				.slice(0, 4)
				.map((row) => row.id)

			const actual = await repository.listPayments({ merchantId, ...filter, fetch: 4 })

			expect(
				actual.map((row) => row.id),
				`filters mask ${mask}`,
			).toEqual(expected)
		}
	})

	test('history keyset pages over one shared timestamp are exhaustive and ordered', async () => {
		const merchantId = await createMerchant('History')
		const wallet = await createWallet(merchantId)
		const ids: string[] = []
		for (let i = 0; i < 30; i++) {
			ids.push(await insertCreditAt(wallet, 10 + i, at(0)))
		}

		const seen: string[] = []
		let after: { createdAt: Date; id: string } | undefined
		for (;;) {
			const rows = await repository.listEntries({ accountId: wallet, after, fetch: 8 })
			const page = rows.slice(0, 7)
			seen.push(...page.map((row) => row.id))
			if (rows.length <= 7) {
				break
			}
			after = { createdAt: page[6].createdAt, id: page[6].id }
		}

		expect(seen).toEqual([...ids].sort().reverse())
	})

	test('history amounts are integer centavos as numbers', async () => {
		const merchantId = await createMerchant('Amounts')
		const wallet = await createWallet(merchantId)
		await insertCreditAt(wallet, 123_456_789, at(0))

		const [entry] = await repository.listEntries({ accountId: wallet, fetch: 2 })

		expect(entry).toMatchObject({ amount: 123_456_789, direction: 'CREDIT' })
	})

	test('the daily report groups by UTC day and status and sums integer volume', async () => {
		const merchantId = await createMerchant('Report')
		const walletA = await createWallet(merchantId)
		const walletB = await createWallet(merchantId)
		const add = (status: Status, amount: number, iso: string) =>
			insertPaymentAt({
				merchantId,
				sourceAccountId: walletA,
				destinationAccountId: walletB,
				amount,
				status,
				at: new Date(iso),
			})
		await add('SUCCEEDED', 5_000_000_000, '2026-09-01T00:00:00Z')
		await add('SUCCEEDED', 5_000_000_000, '2026-09-01T23:00:00Z')
		await add('FAILED', 1, '2026-09-02T00:00:00Z')

		const report = await repository.dailyReport({
			merchantId,
			from: new Date('2026-09-01T00:00:00Z'),
			to: new Date('2026-09-03T00:00:00Z'),
		})

		expect(report).toEqual([
			{ date: '2026-09-01', status: 'SUCCEEDED', count: 2, volume: 10_000_000_000 },
			{ date: '2026-09-02', status: 'FAILED', count: 1, volume: 1 },
		])
	})

	test("listWallets returns only the Merchant's Wallets, newest first, resumable by keyset", async () => {
		const merchantId = await createMerchant('Wallets')
		const otherMerchantId = await createMerchant('Other wallets')
		const ids: string[] = []
		// Nine Wallets over three instants, so ties are exercised.
		for (let i = 0; i < 9; i++) {
			ids.push(await insertWalletAt(merchantId, at(Math.floor(i / 3))))
		}
		await insertWalletAt(otherMerchantId, at(1))

		const expected = newestFirst(
			ids.map((id, i) => ({ id, createdAt: at(Math.floor(i / 3)) })),
		).map((row) => row.id)

		const seen: string[] = []
		let after: { createdAt: Date; id: string } | undefined
		for (;;) {
			const rows = await repository.listWallets({ merchantId, after, fetch: 5 })
			const page = rows.slice(0, 4)
			seen.push(...page.map((row) => row.id))
			expect(rows.every((row) => row.kind === 'WALLET' && row.currency === 'BRL')).toBe(true)
			if (rows.length <= 4) {
				break
			}
			after = { createdAt: page[3].createdAt, id: page[3].id }
		}

		expect(seen).toEqual(expected)
	})

	test('listWallets never returns the External Clearing Account', async () => {
		const merchantId = await createMerchant('No clearing')

		expect(await repository.listWallets({ merchantId, fetch: 10 })).toEqual([])
	})
})
