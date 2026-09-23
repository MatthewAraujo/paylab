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
import { prisma } from '../support/database'
import { provisionMerchant } from '../support/merchants'
import { createWallet, fund, postPayment } from '../support/payments'

// Stands in for a process that dies after transaction one: the first Settlement
// call fails before touching the database.
class CrashingOnceSettlement implements SettlementPort {
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

describe('Payment creation crash between the two transactions (E2E)', () => {
	let app: INestApplication
	let settlement: CrashingOnceSettlement

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(SettlementPort)
			.useFactory({
				factory: (db: PrismaService) => {
					settlement = new CrashingOnceSettlement(new PrismaSettlement(db))
					return settlement
				},
				inject: [PrismaService],
			})
			.compile()
		app = moduleRef.createNestApplication()
		await app.init()
	})

	afterAll(async () => {
		await app?.close()
	})

	test('the Payment stays CREATED and a retry with the same key resumes Settlement exactly once', async () => {
		const merchant = await provisionMerchant(app)
		const source = await createWallet(app, merchant)
		const destination = await createWallet(app, merchant)
		await fund(app, source, 1_000)
		const key = randomUUID()
		const body = {
			sourceAccountId: source,
			destinationAccountId: destination,
			amount: 250,
			currency: 'BRL',
		}
		settlement.crashes = 1

		const crashed = await postPayment(app, merchant, body, key)

		expect(crashed.statusCode).toBe(500)
		const stranded = await prisma.payment.findMany({ where: { idempotencyKey: key } })
		expect(stranded).toHaveLength(1)
		expect(stranded[0].status).toBe('CREATED')
		expect(stranded[0].ledgerTransactionId).toBeNull()

		const retry = await postPayment(app, merchant, body, key)
		const again = await postPayment(app, merchant, body, key)

		expect(retry.body).toMatchObject({ id: stranded[0].id, status: 'SUCCEEDED' })
		expect(again.body).toEqual(retry.body)
		expect(await prisma.payment.count({ where: { idempotencyKey: key } })).toBe(1)
		// One Ledger Transaction for the funding, one for this Payment.
		expect(await prisma.ledgerTransaction.count()).toBe(2)
	})
})
