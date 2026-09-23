import { AppModule } from '@/infra/app.module'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

describe('Health (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = moduleRef.createNestApplication()

		await app.init()
	})

	afterAll(async () => {
		await app?.close()
	})

	test('[GET] /health', async () => {
		const response = await request(app.getHttpServer()).get('/health')

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			status: 'ok',
			app: 'quintal-agro-pet',
			environment: 'test',
		})
	})
})
