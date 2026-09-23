import { generateApiKey } from '@/domain/paylab/application/services/api-key'
import { ProvisionMerchantUseCase } from '@/domain/paylab/application/use-cases/provision-merchant'
import { AppModule } from '@/infra/app.module'
import { ApiKeyGuard } from '@/infra/auth/api-key.guard'
import { AuthModule } from '@/infra/auth/auth.module'
import { CurrentMerchant, MerchantContext } from '@/infra/auth/current-merchant.decorator'
import { Controller, Get, INestApplication, Module, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

// Temporary protected route: T8 and T9 controllers protect themselves the same way.
@Controller('probe')
@UseGuards(ApiKeyGuard)
class ProbeController {
	@Get()
	handle(@CurrentMerchant() merchant: MerchantContext) {
		return { merchantId: merchant.id }
	}
}

@Module({ imports: [AuthModule], controllers: [ProbeController] })
class ProbeModule {}

describe('API key authentication (E2E)', () => {
	let app: INestApplication
	let provision: ProvisionMerchantUseCase

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule, ProbeModule],
		}).compile()
		app = moduleRef.createNestApplication()
		await app.init()
		provision = app.get(ProvisionMerchantUseCase)
	})

	afterAll(async () => {
		await app?.close()
	})

	test('no key returns 401', async () => {
		const response = await request(app.getHttpServer()).get('/probe')

		expect(response.statusCode).toBe(401)
	})

	test('an invalid key returns 401', async () => {
		const response = await request(app.getHttpServer())
			.get('/probe')
			.set('Authorization', `Bearer ${generateApiKey()}`)

		expect(response.statusCode).toBe(401)
	})

	test('a non-bearer scheme returns 401', async () => {
		const { apiKey } = await provision.execute({ name: 'Acme' })

		const response = await request(app.getHttpServer())
			.get('/probe')
			.set('Authorization', `Basic ${apiKey}`)

		expect(response.statusCode).toBe(401)
	})

	test('a valid key reaches the handler with the correct Merchant', async () => {
		const { apiKey, merchantId } = await provision.execute({ name: 'Acme' })

		const response = await request(app.getHttpServer())
			.get('/probe')
			.set('Authorization', `Bearer ${apiKey}`)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ merchantId })
	})

	test('the key of Merchant A never resolves to Merchant B', async () => {
		const a = await provision.execute({ name: 'A' })
		const b = await provision.execute({ name: 'B' })

		const asA = await request(app.getHttpServer())
			.get('/probe')
			.set('Authorization', `Bearer ${a.apiKey}`)
		const asB = await request(app.getHttpServer())
			.get('/probe')
			.set('Authorization', `Bearer ${b.apiKey}`)

		expect(asA.body.merchantId).toBe(a.merchantId)
		expect(asB.body.merchantId).toBe(b.merchantId)
		expect(a.merchantId).not.toBe(b.merchantId)
	})
})
