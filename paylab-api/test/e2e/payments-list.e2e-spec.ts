import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { provisionMerchant } from '../support/merchants'
import { TestMerchant, createWallet, fund, postPayment } from '../support/payments'
import { collectPages, get, insertPaymentAt } from '../support/reads'

type Status = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

interface PaymentItem {
	id: string
	sourceAccountId: string
	destinationAccountId: string
	status: string
	amount: number
	createdAt: string
}

const base = new Date('2026-09-01T10:00:00.000Z')
const minutes = (n: number) => new Date(base.getTime() + n * 60_000)

describe('Payment list (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	async function setup() {
		const merchant = await provisionMerchant(app)
		const walletA = await createWallet(app, merchant)
		const walletB = await createWallet(app, merchant)
		return { merchant, walletA, walletB }
	}

	function insert(
		merchant: TestMerchant,
		source: string,
		destination: string,
		status: Status,
		minute: number,
		amount = 100,
	) {
		return insertPaymentAt({
			merchantId: merchant.merchantId,
			sourceAccountId: source,
			destinationAccountId: destination,
			amount,
			status,
			at: minutes(minute),
		})
	}

	function ids(items: PaymentItem[]) {
		return items.map((item) => item.id)
	}

	test('lists the caller Payments newest first, in the Payment shape', async () => {
		const { merchant, walletA, walletB } = await setup()
		const oldest = await insert(merchant, walletA, walletB, 'SUCCEEDED', 1, 111)
		const newest = await insert(merchant, walletA, walletB, 'FAILED', 2, 222)

		const response = await get(app, merchant, '/v1/payments')

		expect(response.statusCode).toBe(200)
		expect(response.body.nextCursor).toBeNull()
		expect(ids(response.body.items)).toEqual([newest, oldest])
		expect(response.body.items[0]).toMatchObject({
			id: newest,
			sourceAccountId: walletA,
			destinationAccountId: walletB,
			amount: 222,
			currency: 'BRL',
			status: 'FAILED',
			createdAt: minutes(2).toISOString(),
		})
	})

	test('a Payment created through the API appears in the list', async () => {
		const { merchant, walletA, walletB } = await setup()
		await fund(app, walletA, 500)
		const created = await postPayment(app, merchant, {
			sourceAccountId: walletA,
			destinationAccountId: walletB,
			amount: 200,
			currency: 'BRL',
		})

		const response = await get(app, merchant, '/v1/payments')

		// The internal funding Payment (clearing to Wallet) is also this Merchant's; the new one is newest.
		expect(response.body.items).toHaveLength(2)
		expect(response.body.items[0]).toMatchObject({ id: created.body.id, status: 'SUCCEEDED' })
		expect(response.body.items[1]).toMatchObject({ amount: 500, destinationAccountId: walletA })
	})

	test('pages are stable across equal timestamps, never repeat or skip, and end without a cursor', async () => {
		const { merchant, walletA, walletB } = await setup()
		const all: { id: string; minute: number }[] = []
		for (const minute of [1, 1, 1, 2, 2, 2, 3, 3, 3]) {
			all.push({ id: await insert(merchant, walletA, walletB, 'SUCCEEDED', minute), minute })
		}
		const expected = [...all]
			.sort((a, b) => b.minute - a.minute || (a.id < b.id ? 1 : -1))
			.map((row) => row.id)

		const pages = await collectPages<PaymentItem>(app, merchant, '/v1/payments', 4)

		expect(pages.map((page) => page.length)).toEqual([4, 4, 1])
		expect(ids(pages.flat())).toEqual(expected)
	})

	test('rows inserted between page requests do not disturb the walk', async () => {
		const { merchant, walletA, walletB } = await setup()
		const original: string[] = []
		for (const minute of [1, 2, 3, 4, 5]) {
			original.unshift(await insert(merchant, walletA, walletB, 'SUCCEEDED', minute))
		}

		const first = await get(app, merchant, '/v1/payments?limit=2')
		const newer = await insert(merchant, walletA, walletB, 'SUCCEEDED', 20)
		const rest = await collectPages<PaymentItem>(
			app,
			merchant,
			'/v1/payments',
			2,
			first.body.nextCursor,
		)
		const seen = [...ids(first.body.items), ...ids(rest.flat())]

		expect(seen).toEqual(original)
		expect(seen).not.toContain(newer)
	})

	describe('filters', () => {
		async function fixture() {
			const { merchant, walletA, walletB } = await setup()
			const walletC = await createWallet(app, merchant)
			const rows = {
				p1: await insert(merchant, walletA, walletB, 'SUCCEEDED', 1),
				p2: await insert(merchant, walletA, walletC, 'FAILED', 2),
				p3: await insert(merchant, walletB, walletC, 'SUCCEEDED', 3),
				p4: await insert(merchant, walletC, walletA, 'FAILED', 4),
				p5: await insert(merchant, walletB, walletA, 'CREATED', 5),
			}
			return { merchant, walletA, walletB, walletC, ...rows }
		}

		test('by Account matches source or destination', async () => {
			const f = await fixture()

			const response = await get(app, f.merchant, `/v1/payments?accountId=${f.walletA}`)

			expect(ids(response.body.items)).toEqual([f.p5, f.p4, f.p2, f.p1])
		})

		test('by status', async () => {
			const f = await fixture()

			const response = await get(app, f.merchant, '/v1/payments?status=FAILED')

			expect(ids(response.body.items)).toEqual([f.p4, f.p2])
		})

		test('by period: from is inclusive, to is exclusive', async () => {
			const f = await fixture()
			const from = minutes(2).toISOString()
			const to = minutes(4).toISOString()

			const response = await get(app, f.merchant, `/v1/payments?from=${from}&to=${to}`)

			expect(ids(response.body.items)).toEqual([f.p3, f.p2])
		})

		test('combined filters narrow together, and pagination still works', async () => {
			const f = await fixture()
			const query = `accountId=${f.walletC}&status=FAILED&from=${minutes(1).toISOString()}&to=${minutes(5).toISOString()}`

			const all = await get(app, f.merchant, `/v1/payments?${query}`)
			const pages = await collectPages<PaymentItem>(app, f.merchant, `/v1/payments?${query}`, 1)

			expect(ids(all.body.items)).toEqual([f.p4, f.p2])
			expect(pages.map((page) => ids(page))).toEqual([[f.p4], [f.p2]])
		})

		test('a filter matching nothing is an empty page', async () => {
			const f = await fixture()

			const response = await get(app, f.merchant, '/v1/payments?status=PROCESSING')

			expect(response.body).toEqual({ items: [], nextCursor: null })
		})

		test('rejects invalid filter values with 422', async () => {
			const f = await fixture()

			for (const query of [
				'status=DONE',
				'accountId=not-a-uuid',
				'from=yesterday',
				'to=2026-13-01',
				'from=2026-09-05T00:00:00Z&to=2026-09-01T00:00:00Z',
				'offset=1',
			]) {
				const response = await get(app, f.merchant, `/v1/payments?${query}`)
				expect(response.statusCode, query).toBe(422)
			}
		})
	})

	test('only includes the caller Payments', async () => {
		const mine = await setup()
		const theirs = await setup()
		const own = await insert(mine.merchant, mine.walletA, mine.walletB, 'SUCCEEDED', 1)
		await insert(theirs.merchant, theirs.walletA, theirs.walletB, 'SUCCEEDED', 2)
		// A Payment of the other Merchant into one of my Wallets is still not mine.
		await insert(theirs.merchant, theirs.walletA, mine.walletA, 'SUCCEEDED', 3)

		const all = await get(app, mine.merchant, '/v1/payments')
		const filtered = await get(app, mine.merchant, `/v1/payments?accountId=${mine.walletA}`)

		expect(ids(all.body.items)).toEqual([own])
		expect(ids(filtered.body.items)).toEqual([own])
	})

	test('enforces the default and maximum page size', async () => {
		const { merchant, walletA, walletB } = await setup()
		for (let i = 0; i < 25; i++) {
			await insert(merchant, walletA, walletB, 'SUCCEEDED', i)
		}

		const byDefault = await get(app, merchant, '/v1/payments')
		const atMax = await get(app, merchant, '/v1/payments?limit=100')
		const tooBig = await get(app, merchant, '/v1/payments?limit=101')

		expect(byDefault.body.items).toHaveLength(20)
		expect(byDefault.body.nextCursor).toEqual(expect.any(String))
		expect(atMax.body.items).toHaveLength(25)
		expect(tooBig.statusCode).toBe(422)
	})

	test('rejects a tampered cursor and requires an API key', async () => {
		const { merchant, walletA, walletB } = await setup()
		await insert(merchant, walletA, walletB, 'SUCCEEDED', 1)
		await insert(merchant, walletA, walletB, 'SUCCEEDED', 2)
		const page = await get(app, merchant, '/v1/payments?limit=1')
		const cursor: string = page.body.nextCursor

		const tampered = await get(app, merchant, `/v1/payments?cursor=${cursor.slice(0, -2)}`)
		const anonymous = await request(app.getHttpServer()).get('/v1/payments')

		expect(tampered.statusCode).toBe(422)
		expect(anonymous.statusCode).toBe(401)
	})
})
