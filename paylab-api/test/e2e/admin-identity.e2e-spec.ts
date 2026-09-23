import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import {
	BETTER_AUTH_TEST_PASSWORD,
	authenticateStoreMember,
	createBetterAuthUser,
	resetBetterAuthTables,
	signInWithBetterAuth,
} from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

describe('Admin identity (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)

		await app.init()
	})

	beforeEach(async () => {
		await resetDatabase(prisma)
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	test('admin can sign in through Better Auth and retrieve the current profile and store summary', async () => {
		const { store, user, cookie } = await authenticateStoreMember(app, prisma)

		const response = await request(app.getHttpServer())
			.get('/api/v1/admin/me')
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			admin: {
				id: user.id,
				name: user.name,
				email: user.email,
			},
			store: {
				id: store.id,
				name: store.name,
				slug: store.slug,
				timezone: store.timezone,
			},
		})
	})

	test('sign-in rejects invalid credentials', async () => {
		const { user } = await authenticateStoreMember(app, prisma)

		const response = await request(app.getHttpServer())
			.post('/api/auth/sign-in/email')
			.send({ email: user.email, password: 'wrong-password' })

		expect(response.statusCode).toBe(401)
	})

	test('admin identity route rejects unauthenticated access', async () => {
		const response = await request(app.getHttpServer()).get('/api/v1/admin/me')

		expect(response.statusCode).toBe(401)
	})

	test('admin identity route rejects an invalid session cookie', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/v1/admin/me')
			.set('Cookie', 'better-auth.session_token=invalid-token')

		expect(response.statusCode).toBe(401)
	})

	test('a user without a StoreMember record cannot access the admin identity route', async () => {
		const email = 'not-a-store-member@quintal.test'
		const password = BETTER_AUTH_TEST_PASSWORD
		await createBetterAuthUser(prisma, { email, password })

		const cookie = await signInWithBetterAuth(app, email, password)

		const response = await request(app.getHttpServer())
			.get('/api/v1/admin/me')
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(403)
	})

	test('OpenAPI documents the consolidated admin identity contract', async () => {
		const response = await request(app.getHttpServer()).get('/docs-json')

		expect(response.statusCode).toBe(200)
		expect(response.body.paths['/api/v1/admin/me'].get).toEqual(
			expect.objectContaining({
				summary: 'Get the current authenticated admin profile',
				tags: ['Admin Identity'],
				responses: expect.objectContaining({
					'200': expect.objectContaining({
						description: 'Current authenticated admin and store summary.',
					}),
					'401': expect.objectContaining({
						description: 'Missing or invalid admin session.',
					}),
				}),
			}),
		)
		expect(response.body.components.schemas.CurrentAdminProfileResponseDto.properties).toEqual(
			expect.objectContaining({
				admin: expect.any(Object),
				store: expect.any(Object),
			}),
		)
	})
})
