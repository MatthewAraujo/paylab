import { randomUUID } from 'node:crypto'
import { FundWalletFromClearingUseCase } from '@/domain/paylab/application/use-cases/fund-wallet-from-clearing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { provisionMerchant } from './merchants'

// Shared helpers for the payment e2e specs.
export type TestMerchant = Awaited<ReturnType<typeof provisionMerchant>>

export async function createWallet(app: INestApplication, merchant: TestMerchant) {
	const response = await request(app.getHttpServer())
		.post('/v1/accounts')
		.set('Authorization', merchant.auth)
	return response.body.id as string
}

// The internal funding path (clearing -> Wallet); it has no HTTP route.
export async function fund(app: INestApplication, walletId: string, amount: number) {
	const result = await app
		.get(FundWalletFromClearingUseCase, { strict: false })
		.execute({ walletId, amount, idempotencyKey: randomUUID() })
	if (result.isLeft()) {
		throw result.value
	}
}

export function postPayment(
	app: INestApplication,
	merchant: TestMerchant,
	body: Record<string, unknown>,
	key: string | null = randomUUID(),
) {
	const call = request(app.getHttpServer()).post('/v1/payments').set('Authorization', merchant.auth)
	if (key !== null) {
		call.set('Idempotency-Key', key)
	}
	return call.send(body)
}

export async function balanceOf(app: INestApplication, merchant: TestMerchant, walletId: string) {
	const response = await request(app.getHttpServer())
		.get(`/v1/accounts/${walletId}/balance`)
		.set('Authorization', merchant.auth)
	return response.body.balance as number
}
