import { randomUUID } from 'node:crypto'
import { Either } from '@/core/either'
import { SettlementPort } from '@/domain/paylab/application/repositories/settlement-port'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { InvalidPaymentTransitionError } from '@/domain/paylab/enterprise/errors/invalid-payment-transition-error'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaSettlement } from '@/infra/database/repositories/prisma-settlement'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { widePoolUrl } from '../support/concurrency'
import { prisma } from '../support/database'
import { provisionMerchant } from '../support/merchants'
import { TestMerchant, balanceOf, createWallet, fund, postPayment } from '../support/payments'

// Idempotency and crash resume under real parallel HTTP requests (US-33, US-35).

// Stands in for a process that dies after transaction one: the next Settlement
// call fails before touching the database.
class CrashingSettlement implements SettlementPort {
	crashes = 0

	constructor(private real: PrismaSettlement) {}

	async settle(payment: Payment): Promise<Either<InvalidPaymentTransitionError, Payment>> {
		if (this.crashes > 0) {
			this.crashes -= 1
			throw new Error('simulated crash between transaction one and transaction two')
		}
		return this.real.settle(payment)
	}
}

const PARALLEL = 20

let app: INestApplication
let settlement: CrashingSettlement

beforeAll(async () => {
	const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(PrismaService)
		.useFactory({ factory: () => new PrismaService({ datasourceUrl: widePoolUrl() }) })
		.overrideProvider(SettlementPort)
		.useFactory({
			factory: (db: PrismaService) => {
				settlement = new CrashingSettlement(new PrismaSettlement(db))
				return settlement
			},
			inject: [PrismaService],
		})
		.compile()
	app = moduleRef.createNestApplication()
	// Listen once up front: supertest starts and later closes a server that is not
	// listening, which would reset the connections of parallel requests.
	await app.listen(0)
})

afterAll(async () => {
	await app?.close()
})

async function setup(funding: number) {
	const merchant = await provisionMerchant(app)
	const source = await createWallet(app, merchant)
	const destination = await createWallet(app, merchant)
	await fund(app, source, funding)
	return { merchant, source, destination }
}

function body(source: string, destination: string, amount: number) {
	return { sourceAccountId: source, destinationAccountId: destination, amount, currency: 'BRL' }
}

function burst(merchant: TestMerchant, payload: Record<string, unknown>, key: string) {
	return Promise.all(
		Array.from({ length: PARALLEL }, () => postPayment(app, merchant, payload, key)),
	)
}

async function ledgerTransactions() {
	return prisma.ledgerTransaction.count()
}

describe('Idempotency under concurrency', () => {
	it('20 identical requests at once create exactly one Payment and one Ledger Transaction (repeated rounds)', async () => {
		for (let round = 0; round < 10; round++) {
			const { merchant, source, destination } = await setup(10_000)
			const key = randomUUID()
			const before = await ledgerTransactions()

			const responses = await burst(merchant, body(source, destination, 250), key)

			const context = `round ${round}`
			expect(
				responses.filter((r) => r.statusCode === 201),
				context,
			).toHaveLength(1)
			expect(
				responses.filter((r) => r.statusCode === 200),
				context,
			).toHaveLength(PARALLEL - 1)
			expect(new Set(responses.map((r) => r.body.id)).size, context).toBe(1)
			expect(
				responses.every((r) => r.body.status === 'SUCCEEDED'),
				context,
			).toBe(true)
			expect(await prisma.payment.count({ where: { idempotencyKey: key } }), context).toBe(1)
			expect(await ledgerTransactions(), context).toBe(before + 1)
			expect(await balanceOf(app, merchant, source), context).toBe(9_750)
		}
	})

	it('20 identical requests for an unaffordable Payment return one FAILED Payment and write nothing', async () => {
		const { merchant, source, destination } = await setup(100)
		const key = randomUUID()
		const before = await ledgerTransactions()

		const responses = await burst(merchant, body(source, destination, 250), key)

		expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(1)
		expect(new Set(responses.map((r) => r.body.id)).size).toBe(1)
		expect(responses.every((r) => r.body.status === 'FAILED')).toBe(true)
		expect(await prisma.payment.count({ where: { idempotencyKey: key } })).toBe(1)
		expect(await ledgerTransactions()).toBe(before)
	})
})

describe('Crash between transaction one and two, then retry', () => {
	it('a crash leaves one CREATED Payment; 20 parallel retries settle it exactly once (repeated rounds)', async () => {
		for (let round = 0; round < 8; round++) {
			const { merchant, source, destination } = await setup(1_000)
			const key = randomUUID()
			const payload = body(source, destination, 250)
			const before = await ledgerTransactions()
			settlement.crashes = 1

			const crashed = await postPayment(app, merchant, payload, key)

			const context = `round ${round}`
			expect(crashed.statusCode, context).toBe(500)
			const stranded = await prisma.payment.findMany({ where: { idempotencyKey: key } })
			expect(stranded, context).toHaveLength(1)
			expect(stranded[0].status, context).toBe('CREATED')
			expect(await ledgerTransactions(), context).toBe(before)

			const retries = await burst(merchant, payload, key)

			expect(
				retries.every((r) => r.statusCode === 200 && r.body.status === 'SUCCEEDED'),
				context,
			).toBe(true)
			expect(new Set(retries.map((r) => r.body.id)), context).toEqual(new Set([stranded[0].id]))
			expect(await prisma.payment.count({ where: { idempotencyKey: key } }), context).toBe(1)
			expect(await ledgerTransactions(), context).toBe(before + 1)
			expect(await balanceOf(app, merchant, source), context).toBe(750)
		}
	})

	it('a crash inside a parallel burst still ends with exactly one Settlement', async () => {
		for (let round = 0; round < 8; round++) {
			const { merchant, source, destination } = await setup(1_000)
			const key = randomUUID()
			const payload = body(source, destination, 250)
			const before = await ledgerTransactions()
			settlement.crashes = 1

			const first = await burst(merchant, payload, key)

			const context = `round ${round}`
			expect(
				first.filter((r) => r.statusCode === 500),
				context,
			).toHaveLength(1)
			expect(await prisma.payment.count({ where: { idempotencyKey: key } }), context).toBe(1)
			// The other requests resumed the stranded Payment; a retry changes nothing.
			const retry = await postPayment(app, merchant, payload, key)
			expect(retry.body.status, context).toBe('SUCCEEDED')
			expect(await ledgerTransactions(), context).toBe(before + 1)
			expect(await balanceOf(app, merchant, source), context).toBe(750)
		}
	})
})
