import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { provisionMerchant } from '../support/merchants'
import { createWallet } from '../support/payments'
import { collectPages, get, insertCreditAt } from '../support/reads'

interface EntryItem {
	id: string
	ledgerTransactionId: string
	direction: string
	amount: number
	createdAt: string
}

const base = new Date('2026-09-01T10:00:00.000Z')
const minutes = (n: number) => new Date(base.getTime() + n * 60_000)

describe('Ledger Entry history (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	// Newest first, ties broken by id descending: the documented total order.
	function expectedOrder(entries: { id: string; at: Date }[]) {
		return [...entries]
			.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1))
			.map((entry) => entry.id)
	}

	async function seed(walletId: string, times: number[]) {
		const entries: { id: string; at: Date }[] = []
		for (const [index, time] of times.entries()) {
			const at = minutes(time)
			entries.push({ id: await insertCreditAt(walletId, 100 + index, at), at })
		}
		return entries
	}

	test('returns entries newest first with the entry fields', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		await seed(wallet, [1, 3, 2])

		const response = await get(app, merchant, `/v1/accounts/${wallet}/entries`)

		expect(response.statusCode).toBe(200)
		expect(response.body.nextCursor).toBeNull()
		expect(response.body.items.map((item: EntryItem) => item.createdAt)).toEqual([
			minutes(3).toISOString(),
			minutes(2).toISOString(),
			minutes(1).toISOString(),
		])
		expect(response.body.items[0]).toEqual({
			id: expect.any(String),
			ledgerTransactionId: expect.any(String),
			direction: 'CREDIT',
			amount: 101,
			createdAt: minutes(3).toISOString(),
		})
	})

	test('entries sharing one timestamp have a stable order (id descending) across pages', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		// Nine entries: three distinct instants with three entries each.
		const entries = await seed(wallet, [1, 1, 1, 2, 2, 2, 3, 3, 3])

		const pages = await collectPages<EntryItem>(app, merchant, `/v1/accounts/${wallet}/entries`, 2)

		expect(pages.map((page) => page.length)).toEqual([2, 2, 2, 2, 1])
		expect(pages.flat().map((item) => item.id)).toEqual(expectedOrder(entries))
	})

	test('following the cursor never repeats or skips, even with rows inserted between requests', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		const entries = await seed(wallet, [1, 2, 3, 4, 5, 6])

		const first = await get(app, merchant, `/v1/accounts/${wallet}/entries?limit=2`)
		expect(first.body.items).toHaveLength(2)

		// A newer entry and an older one arrive while the client is paging.
		const newer = await insertCreditAt(wallet, 7, minutes(10))
		const older = await insertCreditAt(wallet, 8, minutes(0))

		const rest = await collectPages<EntryItem>(
			app,
			merchant,
			`/v1/accounts/${wallet}/entries`,
			2,
			first.body.nextCursor,
		)
		const seen = [...first.body.items, ...rest.flat()].map((item: EntryItem) => item.id)

		const original = expectedOrder(entries)
		expect(seen).not.toContain(newer)
		expect(seen.filter((id) => id === older)).toHaveLength(1)
		expect(seen.filter((id) => id !== older)).toEqual(original)
		expect(new Set(seen).size).toBe(seen.length)
	})

	test('the last page carries no cursor, an exact multiple included', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		await seed(wallet, [1, 2, 3, 4])

		const first = await get(app, merchant, `/v1/accounts/${wallet}/entries?limit=2`)
		const second = await get(
			app,
			merchant,
			`/v1/accounts/${wallet}/entries?limit=2&cursor=${first.body.nextCursor}`,
		)

		expect(first.body.nextCursor).toEqual(expect.any(String))
		expect(second.body.items).toHaveLength(2)
		expect(second.body.nextCursor).toBeNull()
	})

	test('an empty history is an empty page', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)

		const response = await get(app, merchant, `/v1/accounts/${wallet}/entries`)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ items: [], nextCursor: null })
	})

	test("another Merchant's Account is not found, the same as an unknown one", async () => {
		const owner = await provisionMerchant(app, 'Owner')
		const other = await provisionMerchant(app, 'Other')
		const wallet = await createWallet(app, owner)
		await seed(wallet, [1])

		const foreign = await get(app, other, `/v1/accounts/${wallet}/entries`)
		const unknown = await get(
			app,
			other,
			'/v1/accounts/6f0c2f0e-0000-4000-8000-000000000000/entries',
		)

		expect(foreign.statusCode).toBe(404)
		expect(foreign.body).toEqual(unknown.body)
	})

	test('a cursor from another Account never reveals its entries', async () => {
		const merchant = await provisionMerchant(app)
		const walletA = await createWallet(app, merchant)
		const walletB = await createWallet(app, merchant)
		await seed(walletA, [1, 2, 3])
		const [onlyB] = await seed(walletB, [1])

		const pageA = await get(app, merchant, `/v1/accounts/${walletA}/entries?limit=1`)
		const response = await get(
			app,
			merchant,
			`/v1/accounts/${walletB}/entries?cursor=${pageA.body.nextCursor}`,
		)

		// The position is only a position: the results stay inside Wallet B.
		expect(response.statusCode).toBe(200)
		expect(response.body.items.every((item: EntryItem) => item.id === onlyB.id)).toBe(true)
	})

	test('rejects a tampered or malformed cursor with 422', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		await seed(wallet, [1, 2, 3])
		const page = await get(app, merchant, `/v1/accounts/${wallet}/entries?limit=1`)
		const cursor: string = page.body.nextCursor
		const tampered = `${cursor.slice(0, 4)}${cursor[4] === 'A' ? 'B' : 'A'}${cursor.slice(5)}`

		for (const bad of [tampered, 'garbage', `${cursor}x`]) {
			const response = await get(app, merchant, `/v1/accounts/${wallet}/entries?cursor=${bad}`)
			expect(response.statusCode).toBe(422)
			expect(response.body.code).toBe('VALIDATION_ERROR')
		}
	})

	test('enforces the default and maximum page size', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		await seed(
			wallet,
			Array.from({ length: 25 }, (_, i) => i),
		)

		const byDefault = await get(app, merchant, `/v1/accounts/${wallet}/entries`)
		const atMax = await get(app, merchant, `/v1/accounts/${wallet}/entries?limit=100`)

		expect(byDefault.body.items).toHaveLength(20)
		expect(byDefault.body.nextCursor).toEqual(expect.any(String))
		expect(atMax.body.items).toHaveLength(25)

		for (const limit of ['101', '0', '-1', 'abc', '1.5']) {
			const response = await get(app, merchant, `/v1/accounts/${wallet}/entries?limit=${limit}`)
			expect(response.statusCode).toBe(422)
		}
	})

	test('does not expose offset pagination', async () => {
		const merchant = await provisionMerchant(app)
		const wallet = await createWallet(app, merchant)
		await seed(wallet, [1, 2, 3])

		const response = await get(app, merchant, `/v1/accounts/${wallet}/entries?offset=2&page=2`)

		expect(response.statusCode).toBe(422)
	})

	test('requires an API key', async () => {
		const response = await request(app.getHttpServer()).get(
			'/v1/accounts/6f0c2f0e-0000-4000-8000-000000000000/entries',
		)

		expect(response.statusCode).toBe(401)
	})
})
