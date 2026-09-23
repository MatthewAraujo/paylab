import { createApp } from '@/infra/app.factory'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Swagger exposure in production (E2E)', () => {
	let app: INestApplication
	const originalNodeEnv = process.env.NODE_ENV
	const originalCookieDomain = process.env.COOKIE_DOMAIN

	beforeAll(async () => {
		process.env.NODE_ENV = 'production'
		// validateBetterAuthEnv requires COOKIE_DOMAIN whenever NODE_ENV=production —
		// this suite flips that env var just for this app instance, so it must also
		// satisfy that check the same way a real production deploy would.
		process.env.COOKIE_DOMAIN ??= '.swagger-production-e2e.test'
		app = await createApp()
		await app.init()
	})

	afterAll(async () => {
		await app?.close()
		process.env.NODE_ENV = originalNodeEnv
		process.env.COOKIE_DOMAIN = originalCookieDomain
	})

	test('/docs and /docs-json are not registered when NODE_ENV=production', async () => {
		const docsResponse = await request(app.getHttpServer()).get('/docs')
		const docsJsonResponse = await request(app.getHttpServer()).get('/docs-json')

		expect(docsResponse.statusCode).toBe(404)
		expect(docsJsonResponse.statusCode).toBe(404)
	})
})
