import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { provisionMerchant } from '../support/merchants'
import { createWallet } from '../support/payments'
import { get, insertPaymentAt } from '../support/reads'

type Status = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

describe('Daily report (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	async function setup() {
		const merchant = await provisionMerchant(app)
		const source = await createWallet(app, merchant)
		const destination = await createWallet(app, merchant)
		const add = (status: Status, amount: number, iso: string) =>
			insertPaymentAt({
				merchantId: merchant.merchantId,
				sourceAccountId: source,
				destinationAccountId: destination,
				amount,
				status,
				at: new Date(iso),
			})
		return { merchant, add }
	}

	test('counts and volume per UTC day and status match the fixtures', async () => {
		const { merchant, add } = await setup()
		await add('SUCCEEDED', 100, '2026-09-01T00:00:00.000Z')
		await add('SUCCEEDED', 250, '2026-09-01T23:59:59.999Z')
		await add('FAILED', 40, '2026-09-01T12:00:00.000Z')
		await add('SUCCEEDED', 500, '2026-09-02T00:00:00.000Z')
		await add('CREATED', 7, '2026-09-03T08:00:00.000Z')

		const response = await get(app, merchant, '/v1/reports/daily?from=2026-09-01&to=2026-09-03')

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			from: '2026-09-01',
			to: '2026-09-03',
			items: [
				{ date: '2026-09-01', status: 'SUCCEEDED', count: 2, volume: 350 },
				{ date: '2026-09-01', status: 'FAILED', count: 1, volume: 40 },
				{ date: '2026-09-02', status: 'SUCCEEDED', count: 1, volume: 500 },
				{ date: '2026-09-03', status: 'CREATED', count: 1, volume: 7 },
			],
		})
	})

	test('days are UTC: a late-evening Brazilian payment belongs to the next UTC day', async () => {
		const { merchant, add } = await setup()
		// 22:30 at UTC-3 is 01:30 UTC the next day.
		await add('SUCCEEDED', 100, '2026-09-01T22:30:00-03:00')

		const response = await get(app, merchant, '/v1/reports/daily?from=2026-09-01&to=2026-09-02')

		expect(response.body.items).toEqual([
			{ date: '2026-09-02', status: 'SUCCEEDED', count: 1, volume: 100 },
		])
	})

	test('the range is inclusive of both days and excludes everything outside', async () => {
		const { merchant, add } = await setup()
		await add('SUCCEEDED', 1, '2026-08-31T23:59:59.999Z')
		await add('SUCCEEDED', 2, '2026-09-01T00:00:00.000Z')
		await add('SUCCEEDED', 4, '2026-09-01T23:59:59.999Z')
		await add('SUCCEEDED', 8, '2026-09-02T00:00:00.000Z')

		const response = await get(app, merchant, '/v1/reports/daily?from=2026-09-01&to=2026-09-01')

		expect(response.body.items).toEqual([
			{ date: '2026-09-01', status: 'SUCCEEDED', count: 2, volume: 6 },
		])
	})

	test('an empty range returns an empty result', async () => {
		const { merchant, add } = await setup()
		await add('SUCCEEDED', 1, '2026-09-01T10:00:00.000Z')

		const response = await get(app, merchant, '/v1/reports/daily?from=2026-10-01&to=2026-10-05')

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ from: '2026-10-01', to: '2026-10-05', items: [] })
	})

	test('includes only the caller data', async () => {
		const mine = await setup()
		const theirs = await setup()
		await mine.add('SUCCEEDED', 10, '2026-09-01T10:00:00.000Z')
		await theirs.add('SUCCEEDED', 999, '2026-09-01T10:00:00.000Z')
		await theirs.add('FAILED', 999, '2026-09-01T10:00:00.000Z')

		const response = await get(
			app,
			mine.merchant,
			'/v1/reports/daily?from=2026-09-01&to=2026-09-01',
		)

		expect(response.body.items).toEqual([
			{ date: '2026-09-01', status: 'SUCCEEDED', count: 1, volume: 10 },
		])
	})

	test('rejects invalid ranges with 422', async () => {
		const { merchant } = await setup()

		for (const query of [
			'',
			'from=2026-09-01',
			'to=2026-09-01',
			'from=2026-09-05&to=2026-09-01',
			'from=2026-02-30&to=2026-03-01',
			'from=2026-09-01T00:00:00Z&to=2026-09-02',
			'from=2025-01-01&to=2026-09-01',
		]) {
			const response = await get(app, merchant, `/v1/reports/daily?${query}`)
			expect(response.statusCode, query).toBe(422)
		}
	})

	test('requires an API key', async () => {
		const response = await request(app.getHttpServer()).get(
			'/v1/reports/daily?from=2026-09-01&to=2026-09-01',
		)

		expect(response.statusCode).toBe(401)
	})
})
