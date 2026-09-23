import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { prisma } from '../support/database'
import { clearingAccountId } from '../support/fixtures'
import { provisionMerchant } from '../support/merchants'
import { balanceOf, createWallet, fund, postPayment } from '../support/payments'

describe('Payments (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	async function setup() {
		const merchant = await provisionMerchant(app, 'Acme')
		const source = await createWallet(app, merchant)
		const destination = await createWallet(app, merchant)
		return { merchant, source, destination }
	}

	const paymentCount = () => prisma.payment.count()
	const ledgerTransactionCount = () => prisma.ledgerTransaction.count()

	test('a Wallet-to-Wallet Payment succeeds and the ledger reflects it', async () => {
		const { merchant, source, destination } = await setup()
		await fund(app, source, 1_000)
		const ledgerBefore = await ledgerTransactionCount()

		const response = await postPayment(app, merchant, {
			sourceAccountId: source,
			destinationAccountId: destination,
			amount: 300,
			currency: 'BRL',
		})

		expect(response.statusCode).toBe(201)
		expect(response.body).toMatchObject({
			id: expect.any(String),
			sourceAccountId: source,
			destinationAccountId: destination,
			amount: 300,
			currency: 'BRL',
			status: 'SUCCEEDED',
			failureReason: null,
			ledgerTransactionId: expect.any(String),
		})
		expect(await ledgerTransactionCount()).toBe(ledgerBefore + 1)
		expect(await balanceOf(app, merchant, source)).toBe(700)
		expect(await balanceOf(app, merchant, destination)).toBe(300)
	})

	test('insufficient funds returns 201 with a FAILED Payment and writes no ledger rows', async () => {
		const { merchant, source, destination } = await setup()
		await fund(app, source, 100)
		const ledgerBefore = await ledgerTransactionCount()

		const response = await postPayment(app, merchant, {
			sourceAccountId: source,
			destinationAccountId: destination,
			amount: 101,
			currency: 'BRL',
		})

		expect(response.statusCode).toBe(201)
		expect(response.body).toMatchObject({
			status: 'FAILED',
			failureReason: 'INSUFFICIENT_FUNDS',
			ledgerTransactionId: null,
		})
		expect(await ledgerTransactionCount()).toBe(ledgerBefore)
		expect(await balanceOf(app, merchant, source)).toBe(100)
	})

	describe('invalid requests return 422 and create no Payment', () => {
		const cases: [
			string,
			(ids: { source: string; destination: string }) => Record<string, unknown>,
		][] = [
			['zero Amount', (i) => ({ ...valid(i), amount: 0 })],
			['negative Amount', (i) => ({ ...valid(i), amount: -5 })],
			['non-integer Amount', (i) => ({ ...valid(i), amount: 10.5 })],
			['string Amount', (i) => ({ ...valid(i), amount: '10' })],
			['Amount beyond the safe integer range', (i) => ({ ...valid(i), amount: 2 ** 60 })],
			['same source and destination', (i) => ({ ...valid(i), destinationAccountId: i.source })],
			['unknown destination Account', (i) => ({ ...valid(i), destinationAccountId: randomUUID() })],
			['currency other than BRL', (i) => ({ ...valid(i), currency: 'USD' })],
			['missing currency', (i) => ({ ...valid(i), currency: undefined })],
			['malformed source id', (i) => ({ ...valid(i), sourceAccountId: 'not-a-uuid' })],
			['unexpected field', (i) => ({ ...valid(i), extra: true })],
		]

		function valid(i: { source: string; destination: string }) {
			return {
				sourceAccountId: i.source,
				destinationAccountId: i.destination,
				amount: 10,
				currency: 'BRL',
			}
		}

		test.each(cases)('%s', async (_name, build) => {
			const { merchant, source, destination } = await setup()
			await fund(app, source, 1_000)
			const before = await paymentCount()

			const response = await postPayment(app, merchant, build({ source, destination }))

			expect(response.statusCode).toBe(422)
			expect(response.body.code).toEqual(expect.any(String))
			expect(await paymentCount()).toBe(before)
		})

		test('missing Idempotency-Key', async () => {
			const { merchant, source, destination } = await setup()
			const before = await paymentCount()

			const response = await postPayment(app, merchant, valid({ source, destination }), null)

			expect(response.statusCode).toBe(422)
			expect(response.body.code).toBe('VALIDATION_ERROR')
			expect(await paymentCount()).toBe(before)
		})
	})

	test("another Merchant's Wallet or an unknown Account as source is not found, identically", async () => {
		const { merchant, destination } = await setup()
		const other = await provisionMerchant(app, 'Other')
		const foreign = await createWallet(app, other)
		await fund(app, foreign, 1_000)
		const before = await paymentCount()
		const body = (source: string) => ({
			sourceAccountId: source,
			destinationAccountId: destination,
			amount: 10,
			currency: 'BRL',
		})

		const foreignResponse = await postPayment(app, merchant, body(foreign))
		const unknownResponse = await postPayment(app, merchant, body(randomUUID()))

		expect(foreignResponse.statusCode).toBe(404)
		expect(unknownResponse.statusCode).toBe(404)
		expect(foreignResponse.body).toEqual(unknownResponse.body)
		expect(await paymentCount()).toBe(before)
		expect(await balanceOf(app, other, foreign)).toBe(1_000)
	})

	test('the External Clearing Account cannot be the source', async () => {
		const { merchant, destination } = await setup()
		const before = await paymentCount()

		const response = await postPayment(app, merchant, {
			sourceAccountId: await clearingAccountId(),
			destinationAccountId: destination,
			amount: 10,
			currency: 'BRL',
		})

		expect(response.statusCode).toBe(404)
		expect(await paymentCount()).toBe(before)
		expect(await balanceOf(app, merchant, destination)).toBe(0)
	})

	test("paying another Merchant's Wallet succeeds", async () => {
		const { merchant, source } = await setup()
		const other = await provisionMerchant(app, 'Other')
		const foreign = await createWallet(app, other)
		await fund(app, source, 500)

		const response = await postPayment(app, merchant, {
			sourceAccountId: source,
			destinationAccountId: foreign,
			amount: 200,
			currency: 'BRL',
		})

		expect(response.statusCode).toBe(201)
		expect(response.body.status).toBe('SUCCEEDED')
		expect(await balanceOf(app, other, foreign)).toBe(200)
	})

	test('a withdrawal to the External Clearing Account works and respects funds', async () => {
		const { merchant, source } = await setup()
		await fund(app, source, 500)
		const clearing = await clearingAccountId()
		const withdraw = (amount: number) =>
			postPayment(app, merchant, {
				sourceAccountId: source,
				destinationAccountId: clearing,
				amount,
				currency: 'BRL',
			})

		const ok = await withdraw(500)
		const tooMuch = await withdraw(1)

		expect(ok.body.status).toBe('SUCCEEDED')
		expect(tooMuch.body).toMatchObject({ status: 'FAILED', failureReason: 'INSUFFICIENT_FUNDS' })
		expect(await balanceOf(app, merchant, source)).toBe(0)
	})

	describe('idempotency', () => {
		test('same key and same body returns the same Payment without a second Ledger Transaction', async () => {
			const { merchant, source, destination } = await setup()
			await fund(app, source, 1_000)
			const key = randomUUID()
			const body = {
				sourceAccountId: source,
				destinationAccountId: destination,
				amount: 100,
				currency: 'BRL',
			}

			const first = await postPayment(app, merchant, body, key)
			const ledgerAfterFirst = await ledgerTransactionCount()
			const replay = await postPayment(app, merchant, body, key)

			expect(first.statusCode).toBe(201)
			expect(replay.statusCode).toBe(200)
			expect(replay.body).toEqual(first.body)
			expect(await ledgerTransactionCount()).toBe(ledgerAfterFirst)
			expect(await prisma.payment.count({ where: { idempotencyKey: key } })).toBe(1)
			expect(await balanceOf(app, merchant, source)).toBe(900)
		})

		test('same key with a different body returns 422', async () => {
			const { merchant, source, destination } = await setup()
			await fund(app, source, 1_000)
			const key = randomUUID()
			const body = {
				sourceAccountId: source,
				destinationAccountId: destination,
				amount: 100,
				currency: 'BRL',
			}
			await postPayment(app, merchant, body, key)

			const response = await postPayment(app, merchant, { ...body, amount: 101 }, key)

			expect(response.statusCode).toBe(422)
			expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED')
			expect(await balanceOf(app, merchant, source)).toBe(900)
		})

		test('a different Merchant may reuse the same key', async () => {
			const a = await setup()
			const b = await setup()
			await fund(app, a.source, 100)
			await fund(app, b.source, 100)
			const key = randomUUID()

			const first = await postPayment(
				app,
				a.merchant,
				{
					sourceAccountId: a.source,
					destinationAccountId: a.destination,
					amount: 10,
					currency: 'BRL',
				},
				key,
			)
			const second = await postPayment(
				app,
				b.merchant,
				{
					sourceAccountId: b.source,
					destinationAccountId: b.destination,
					amount: 10,
					currency: 'BRL',
				},
				key,
			)

			expect(first.statusCode).toBe(201)
			expect(second.statusCode).toBe(201)
			expect(first.body.id).not.toBe(second.body.id)
		})

		test('a FAILED Payment replays as the same failure even after funds arrive', async () => {
			const { merchant, source, destination } = await setup()
			const key = randomUUID()
			const body = {
				sourceAccountId: source,
				destinationAccountId: destination,
				amount: 100,
				currency: 'BRL',
			}
			const first = await postPayment(app, merchant, body, key)
			await fund(app, source, 1_000)
			const ledgerBefore = await ledgerTransactionCount()

			const replay = await postPayment(app, merchant, body, key)

			expect(first.body.status).toBe('FAILED')
			expect(replay.body).toEqual(first.body)
			expect(await ledgerTransactionCount()).toBe(ledgerBefore)
			expect(await balanceOf(app, merchant, source)).toBe(1_000)
		})

		test('identical requests sent at the same time yield exactly one Payment and one Ledger Transaction', async () => {
			const { merchant, source, destination } = await setup()
			await fund(app, source, 1_000)
			const ledgerBefore = await ledgerTransactionCount()
			const key = randomUUID()
			const body = {
				sourceAccountId: source,
				destinationAccountId: destination,
				amount: 100,
				currency: 'BRL',
			}

			const responses = await Promise.all(
				Array.from({ length: 5 }, () => postPayment(app, merchant, body, key)),
			)

			expect(new Set(responses.map((r) => r.body.id)).size).toBe(1)
			expect(responses.every((r) => r.body.status === 'SUCCEEDED')).toBe(true)
			expect(await prisma.payment.count({ where: { idempotencyKey: key } })).toBe(1)
			expect(await ledgerTransactionCount()).toBe(ledgerBefore + 1)
			expect(await balanceOf(app, merchant, source)).toBe(900)
		})
	})

	describe('[GET] /v1/payments/:id', () => {
		test('returns own Payments and not-found for another Merchant or an unknown id', async () => {
			const { merchant, source, destination } = await setup()
			const other = await provisionMerchant(app, 'Other')
			await fund(app, source, 100)
			const created = await postPayment(app, merchant, {
				sourceAccountId: source,
				destinationAccountId: destination,
				amount: 10,
				currency: 'BRL',
			})

			const own = await request(app.getHttpServer())
				.get(`/v1/payments/${created.body.id}`)
				.set('Authorization', merchant.auth)
			const foreign = await request(app.getHttpServer())
				.get(`/v1/payments/${created.body.id}`)
				.set('Authorization', other.auth)
			const unknown = await request(app.getHttpServer())
				.get(`/v1/payments/${randomUUID()}`)
				.set('Authorization', other.auth)

			expect(own.statusCode).toBe(200)
			expect(own.body).toEqual(created.body)
			expect(foreign.statusCode).toBe(404)
			expect(foreign.body).toEqual(unknown.body)
		})

		test('unauthenticated requests return 401', async () => {
			const server = app.getHttpServer()

			expect((await request(server).post('/v1/payments')).statusCode).toBe(401)
			expect((await request(server).get(`/v1/payments/${randomUUID()}`)).statusCode).toBe(401)
		})
	})
})
