import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { clearingAccountId } from '../support/fixtures'
import { provisionMerchant } from '../support/merchants'
import { collectPages, get, insertWalletAt } from '../support/reads'

interface WalletItem {
	id: string
	kind: string
	currency: string
	createdAt: string
}

const base = new Date('2026-09-01T10:00:00.000Z')
const minutes = (n: number) => new Date(base.getTime() + n * 60_000)

describe('Wallet list (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	test("returns the Merchant's Wallets newest first with id, kind, currency and createdAt", async () => {
		const { merchantId, auth } = await provisionMerchant(app)
		const older = await insertWalletAt(merchantId, minutes(1))
		const newer = await insertWalletAt(merchantId, minutes(2))

		const response = await request(app.getHttpServer())
			.get('/v1/accounts')
			.set('Authorization', auth)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			items: [
				{ id: newer, kind: 'WALLET', currency: 'BRL', createdAt: minutes(2).toISOString() },
				{ id: older, kind: 'WALLET', currency: 'BRL', createdAt: minutes(1).toISOString() },
			],
			nextCursor: null,
		})
	})

	test('a Merchant with no Wallet gets an empty page', async () => {
		const merchant = await provisionMerchant(app)

		const response = await get(app, merchant, '/v1/accounts')

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ items: [], nextCursor: null })
	})

	test("never lists another Merchant's Wallets or the External Clearing Account", async () => {
		const mine = await provisionMerchant(app, 'Mine')
		const theirs = await provisionMerchant(app, 'Theirs')
		const own = await insertWalletAt(mine.merchantId, minutes(1))
		await insertWalletAt(theirs.merchantId, minutes(2))

		const response = await get(app, mine, '/v1/accounts')
		const ids = response.body.items.map((item: WalletItem) => item.id)

		expect(ids).toEqual([own])
		expect(ids).not.toContain(await clearingAccountId())
	})

	test('cursor pagination is stable across pages, ties included', async () => {
		const merchant = await provisionMerchant(app)
		const created: { id: string; at: Date }[] = []
		for (const time of [1, 1, 1, 2, 2, 3, 3]) {
			created.push({
				id: await insertWalletAt(merchant.merchantId, minutes(time)),
				at: minutes(time),
			})
		}
		const expected = [...created]
			.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1))
			.map((wallet) => wallet.id)

		const pages = await collectPages<WalletItem>(app, merchant, '/v1/accounts', 3)

		expect(pages.map((page) => page.length)).toEqual([3, 3, 1])
		expect(pages.flat().map((item) => item.id)).toEqual(expected)
	})

	test('enforces the page size default and maximum and rejects offset pagination', async () => {
		const merchant = await provisionMerchant(app)

		expect((await get(app, merchant, '/v1/accounts?limit=100')).statusCode).toBe(200)
		expect((await get(app, merchant, '/v1/accounts?limit=101')).statusCode).toBe(422)
		expect((await get(app, merchant, '/v1/accounts?limit=0')).statusCode).toBe(422)
		expect((await get(app, merchant, '/v1/accounts?offset=1')).statusCode).toBe(422)
		expect((await get(app, merchant, '/v1/accounts?page=2')).statusCode).toBe(422)
		expect((await get(app, merchant, '/v1/accounts?cursor=garbage')).statusCode).toBe(422)
	})

	test('requires authentication', async () => {
		const response = await request(app.getHttpServer()).get('/v1/accounts')

		expect(response.statusCode).toBe(401)
	})
})
