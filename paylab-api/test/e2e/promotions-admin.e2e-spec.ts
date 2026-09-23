import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

const createBody = {
	name: 'Leve 3 pague 2 nos sachês',
	targetScope: 'ELIGIBLE_ITEMS',
	channels: ['ECOMMERCE'],
	visibility: 'PUBLIC',
	priority: 10,
	isStackable: false,
	conditions: [{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 3 }],
	benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }],
	publicHighlight: { badge: '3 por R$ 60,00', projectedPack: { quantity: 3, priceCents: 6000 } },
}

describe('Promotions admin API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
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

	test('operator can create, list, read and update a promotion', async () => {
		const owner = await authenticateStoreMember(app, prisma, { email: 'promo-admin@quintal.test' })

		const created = await request(app.getHttpServer())
			.post('/api/v1/admin/promotions')
			.set('Cookie', owner.cookie)
			.send(createBody)

		expect(created.statusCode).toBe(201)
		expect(created.body).toMatchObject({
			name: createBody.name,
			status: 'DRAFT',
			visibility: 'PUBLIC',
			channels: ['ECOMMERCE'],
			priority: 10,
			targetScope: 'ELIGIBLE_ITEMS',
			isEligibleForPublicDiscovery: false,
		})
		const promotionId = created.body.id

		const list = await request(app.getHttpServer())
			.get('/api/v1/admin/promotions')
			.set('Cookie', owner.cookie)
		expect(list.statusCode).toBe(200)
		expect(list.body).toMatchObject({ total: 1, page: 1, perPage: 20 })
		expect(list.body.items).toHaveLength(1)

		const read = await request(app.getHttpServer())
			.get(`/api/v1/admin/promotions/${promotionId}`)
			.set('Cookie', owner.cookie)
		expect(read.statusCode).toBe(200)
		expect(read.body.id).toBe(promotionId)

		const updated = await request(app.getHttpServer())
			.put(`/api/v1/admin/promotions/${promotionId}`)
			.set('Cookie', owner.cookie)
			.send({ name: 'Campanha renomeada', priority: 25 })
		expect(updated.statusCode).toBe(200)
		expect(updated.body).toMatchObject({ name: 'Campanha renomeada', priority: 25 })
	})

	test('rejects a promotion id from another store with 404', async () => {
		const owner = await authenticateStoreMember(app, prisma, { email: 'promo-a@quintal.test' })
		const foreign = await authenticateStoreMember(app, prisma, { email: 'promo-b@quintal.test' })

		const created = await request(app.getHttpServer())
			.post('/api/v1/admin/promotions')
			.set('Cookie', foreign.cookie)
			.send(createBody)
		expect(created.statusCode).toBe(201)

		const read = await request(app.getHttpServer())
			.get(`/api/v1/admin/promotions/${created.body.id}`)
			.set('Cookie', owner.cookie)
		expect(read.statusCode).toBe(404)
	})

	test('activate / deactivate transitions and rejects an illegal transition', async () => {
		const owner = await authenticateStoreMember(app, prisma, { email: 'promo-tx@quintal.test' })
		const created = await request(app.getHttpServer())
			.post('/api/v1/admin/promotions')
			.set('Cookie', owner.cookie)
			.send(createBody)
		const id = created.body.id

		const activated = await request(app.getHttpServer())
			.post(`/api/v1/admin/promotions/${id}/activate`)
			.set('Cookie', owner.cookie)
		expect(activated.statusCode).toBe(200)
		expect(activated.body).toMatchObject({
			status: 'ACTIVE',
			isEligibleForPublicDiscovery: true,
		})

		const archived = await request(app.getHttpServer())
			.post(`/api/v1/admin/promotions/${id}/archive`)
			.set('Cookie', owner.cookie)
		expect(archived.statusCode).toBe(200)
		expect(archived.body.status).toBe('ARCHIVED')

		const illegal = await request(app.getHttpServer())
			.post(`/api/v1/admin/promotions/${id}/activate`)
			.set('Cookie', owner.cookie)
		expect(illegal.statusCode).toBe(400)
		expect(illegal.body.code).toBe('INVALID_PROMOTION_TRANSITION')
	})

	test('curates the home offers lane from discovery-eligible public promotions only', async () => {
		const owner = await authenticateStoreMember(app, prisma, { email: 'promo-home@quintal.test' })

		const publicActive = await request(app.getHttpServer())
			.post('/api/v1/admin/promotions')
			.set('Cookie', owner.cookie)
			.send(createBody)
		await request(app.getHttpServer())
			.post(`/api/v1/admin/promotions/${publicActive.body.id}/activate`)
			.set('Cookie', owner.cookie)

		const couponOnly = await request(app.getHttpServer())
			.post('/api/v1/admin/promotions')
			.set('Cookie', owner.cookie)
			.send({
				...createBody,
				name: 'Cupom secreto',
				publicHighlight: null,
				conditions: [{ type: 'COUPON', code: 'promo10' }],
				benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
			})
		await request(app.getHttpServer())
			.post(`/api/v1/admin/promotions/${couponOnly.body.id}/activate`)
			.set('Cookie', owner.cookie)

		const rejected = await request(app.getHttpServer())
			.put('/api/v1/admin/promotions/home-offers')
			.set('Cookie', owner.cookie)
			.send({ promotionIds: [publicActive.body.id, couponOnly.body.id] })
		expect(rejected.statusCode).toBe(400)
		expect(rejected.body.code).toBe('INVALID_HOME_OFFER_SELECTION')

		const curated = await request(app.getHttpServer())
			.put('/api/v1/admin/promotions/home-offers')
			.set('Cookie', owner.cookie)
			.send({ promotionIds: [publicActive.body.id] })
		expect(curated.statusCode).toBe(200)
		expect(curated.body.offers).toEqual([
			expect.objectContaining({ promotionId: publicActive.body.id, position: 1 }),
		])

		const home = await request(app.getHttpServer())
			.get('/api/v1/admin/promotions/home-offers')
			.set('Cookie', owner.cookie)
		expect(home.body.offers).toHaveLength(1)

		// Deactivating a curated promotion drops it from the lane.
		await request(app.getHttpServer())
			.post(`/api/v1/admin/promotions/${publicActive.body.id}/deactivate`)
			.set('Cookie', owner.cookie)
		const homeAfter = await request(app.getHttpServer())
			.get('/api/v1/admin/promotions/home-offers')
			.set('Cookie', owner.cookie)
		expect(homeAfter.body.offers).toHaveLength(0)
	})
})
