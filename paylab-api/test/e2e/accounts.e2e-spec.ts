import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { prisma } from '../support/database'
import { clearingAccountId, createFundingLedgerTransaction } from '../support/fixtures'
import { provisionMerchant } from '../support/merchants'

describe('Accounts (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	async function createWallet(auth: string) {
		const response = await request(app.getHttpServer())
			.post('/v1/accounts')
			.set('Authorization', auth)
		expect(response.statusCode).toBe(201)
		return response.body as { id: string; kind: string; currency: string }
	}

	test('[POST] /v1/accounts creates a BRL Wallet with a zero Balance', async () => {
		const { auth } = await provisionMerchant(app)

		const wallet = await createWallet(auth)

		expect(wallet).toEqual({ id: expect.any(String), kind: 'WALLET', currency: 'BRL' })

		const balance = await request(app.getHttpServer())
			.get(`/v1/accounts/${wallet.id}/balance`)
			.set('Authorization', auth)

		expect(balance.statusCode).toBe(200)
		expect(balance.body).toEqual({ accountId: wallet.id, balance: 0, currency: 'BRL' })
	})

	test('a Merchant can create several Wallets', async () => {
		const { auth, merchantId } = await provisionMerchant(app)

		const first = await createWallet(auth)
		const second = await createWallet(auth)

		expect(first.id).not.toBe(second.id)
		expect(await prisma.account.count({ where: { merchantId } })).toBe(2)
	})

	test('[GET] /v1/accounts/:id returns the Wallet for its owner', async () => {
		const { auth } = await provisionMerchant(app)
		const wallet = await createWallet(auth)

		const response = await request(app.getHttpServer())
			.get(`/v1/accounts/${wallet.id}`)
			.set('Authorization', auth)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual(wallet)
	})

	test('[GET] balance is credits minus debits after some movements', async () => {
		const { auth } = await provisionMerchant(app)
		const wallet = await createWallet(auth)
		const other = await createWallet(auth)
		const clearing = await clearingAccountId()
		await createFundingLedgerTransaction(wallet.id, clearing, 1_000)
		await createFundingLedgerTransaction(other.id, clearing, 400)
		// Arguments swapped on purpose: debit the Wallet 250, credit clearing.
		await createFundingLedgerTransaction(clearing, wallet.id, 250)

		const response = await request(app.getHttpServer())
			.get(`/v1/accounts/${wallet.id}/balance`)
			.set('Authorization', auth)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ accountId: wallet.id, balance: 750, currency: 'BRL' })
	})

	test("another Merchant's Wallet and an unknown id return identical not-found responses", async () => {
		const owner = await provisionMerchant(app, 'Owner')
		const intruder = await provisionMerchant(app, 'Intruder')
		const wallet = await createWallet(owner.auth)
		const unknownId = '5b0b6d0e-7c5e-4d3e-9d0a-000000000000'

		for (const path of ['', '/balance']) {
			const foreign = await request(app.getHttpServer())
				.get(`/v1/accounts/${wallet.id}${path}`)
				.set('Authorization', intruder.auth)
			const unknown = await request(app.getHttpServer())
				.get(`/v1/accounts/${unknownId}${path}`)
				.set('Authorization', intruder.auth)

			expect(foreign.statusCode).toBe(404)
			expect(unknown.statusCode).toBe(404)
			expect(foreign.body).toEqual(unknown.body)
		}
	})

	test('the External Clearing Account is never returned through the API', async () => {
		const { auth } = await provisionMerchant(app)
		const clearing = await clearingAccountId()

		for (const path of ['', '/balance']) {
			const response = await request(app.getHttpServer())
				.get(`/v1/accounts/${clearing}${path}`)
				.set('Authorization', auth)

			expect(response.statusCode).toBe(404)
		}
	})

	test('the API cannot create a clearing Account: the kind is always WALLET', async () => {
		const { auth } = await provisionMerchant(app)

		const response = await request(app.getHttpServer())
			.post('/v1/accounts')
			.set('Authorization', auth)
			.send({ kind: 'EXTERNAL_CLEARING', currency: 'USD' })

		expect(response.statusCode).toBe(201)
		expect(response.body).toEqual({ id: expect.any(String), kind: 'WALLET', currency: 'BRL' })
		expect(await prisma.account.count({ where: { kind: 'EXTERNAL_CLEARING' } })).toBe(1)
	})

	test('unauthenticated requests return 401', async () => {
		const id = '5b0b6d0e-7c5e-4d3e-9d0a-000000000000'
		const server = app.getHttpServer()

		expect((await request(server).post('/v1/accounts')).statusCode).toBe(401)
		expect((await request(server).get(`/v1/accounts/${id}`)).statusCode).toBe(401)
		expect((await request(server).get(`/v1/accounts/${id}/balance`)).statusCode).toBe(401)
	})
})
