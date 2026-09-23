import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

describe('Module Boundaries (E2E)', () => {
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

	afterAll(async () => {
		await prisma.storeMember.deleteMany()
		await resetBetterAuthTables(prisma)
		await prisma.store.deleteMany()
		await app?.close()
	})

	test('[GET] /api/v1/platform/bounded-contexts requires an authenticated session', async () => {
		const response = await request(app.getHttpServer()).get('/api/v1/platform/bounded-contexts')

		expect(response.statusCode).toBe(401)
	})

	test('[GET] /api/v1/platform/bounded-contexts returns the boundary map for a store member', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma, {
			storeName: 'Boundary Store',
			storeSlug: `boundary-${Math.random().toString(36).slice(2, 8)}`,
		})

		const response = await request(app.getHttpServer())
			.get('/api/v1/platform/bounded-contexts')
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			product: 'quintal-agro-pet',
			boundedContexts: [
				{ name: 'identity', routePrefix: '/api/v1/auth', status: 'foundation' },
				{ name: 'catalog', routePrefix: '/api/v1/admin/catalog', status: 'foundation' },
				{ name: 'inventory', routePrefix: '/api/v1/admin/inventory', status: 'foundation' },
				{ name: 'merchandising', routePrefix: '/api/v1/admin/merchandising', status: 'foundation' },
			],
		})
	})
})
