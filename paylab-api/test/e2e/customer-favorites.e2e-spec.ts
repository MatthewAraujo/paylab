import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import {
	authenticateCustomer,
	authenticateStoreMember,
	resetBetterAuthTables,
} from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.customerFavorite.deleteMany()
	await prisma.cRMInteraction.deleteMany()
	await prisma.cRMProfile.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.attachment.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

async function createProduct(
	prisma: PrismaService,
	storeId: string,
	slug: string,
	status: 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED' = 'ACTIVE',
) {
	return prisma.product.create({
		data: { storeId, name: `Produto ${slug}`, slug, status },
	})
}

describe('Customer favorites API (E2E)', () => {
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

	test('GET /favorites on a customer with no favorites returns an empty list', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Norte', slug: 'quintal-norte-favorites' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/favorites`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ productSlugs: [] })
	})

	test('POST /favorites/:productSlug adds a favorite, reflected on GET, and is idempotent on repeat calls', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sul', slug: 'quintal-sul-favorites' },
		})
		const product = await createProduct(prisma, store.id, 'produto-favorito', 'ACTIVE')
		const { cookie } = await authenticateCustomer(app, prisma)
		const base = `/api/v1/stores/${store.slug}/account/favorites`

		const firstPost = await request(app.getHttpServer())
			.post(`${base}/${product.slug}`)
			.set('Cookie', cookie)
		expect(firstPost.statusCode).toBeLessThan(300)

		const secondPost = await request(app.getHttpServer())
			.post(`${base}/${product.slug}`)
			.set('Cookie', cookie)
		expect(secondPost.statusCode).toBeLessThan(300)

		const getResponse = await request(app.getHttpServer()).get(base).set('Cookie', cookie)
		expect(getResponse.body).toEqual({ productSlugs: [product.slug] })
	})

	test('POST /favorites/:productSlug with an unknown slug returns a client error and persists nothing', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Leste', slug: 'quintal-leste-favorites' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/favorites/slug-inexistente`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBeGreaterThanOrEqual(400)
		expect(response.statusCode).toBeLessThan(500)

		const getResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/favorites`)
			.set('Cookie', cookie)
		expect(getResponse.body).toEqual({ productSlugs: [] })
	})

	test('POST /favorites/:productSlug with an unpublished slug returns a client error, not a silent success', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Oeste', slug: 'quintal-oeste-favorites' },
		})
		const draftProduct = await createProduct(prisma, store.id, 'produto-rascunho', 'DRAFT')
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/favorites/${draftProduct.slug}`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBeGreaterThanOrEqual(400)
		expect(response.statusCode).toBeLessThan(500)
	})

	test('DELETE /favorites/:productSlug removes it, and calling it again is a no-op', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Centro', slug: 'quintal-centro-favorites' },
		})
		const product = await createProduct(prisma, store.id, 'produto-remover', 'ACTIVE')
		const { cookie } = await authenticateCustomer(app, prisma)
		const base = `/api/v1/stores/${store.slug}/account/favorites`

		await request(app.getHttpServer()).post(`${base}/${product.slug}`).set('Cookie', cookie)

		const firstDelete = await request(app.getHttpServer())
			.delete(`${base}/${product.slug}`)
			.set('Cookie', cookie)
		expect(firstDelete.statusCode).toBeLessThan(300)

		const secondDelete = await request(app.getHttpServer())
			.delete(`${base}/${product.slug}`)
			.set('Cookie', cookie)
		expect(secondDelete.statusCode).toBeLessThan(300)

		const getResponse = await request(app.getHttpServer()).get(base).set('Cookie', cookie)
		expect(getResponse.body).toEqual({ productSlugs: [] })
	})

	test('PUT /favorites replaces the visible set, silently dropping slugs that do not resolve to a published product', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Nordeste', slug: 'quintal-nordeste-favorites' },
		})
		const validProduct = await createProduct(prisma, store.id, 'produto-valido-put', 'ACTIVE')
		const draftProduct = await createProduct(prisma, store.id, 'produto-rascunho-put', 'DRAFT')
		const { cookie } = await authenticateCustomer(app, prisma)
		const base = `/api/v1/stores/${store.slug}/account/favorites`

		const putResponse = await request(app.getHttpServer())
			.put(base)
			.set('Cookie', cookie)
			.send({ productSlugs: [validProduct.slug, draftProduct.slug, 'slug-que-nao-existe'] })

		expect(putResponse.statusCode).toBe(200)
		expect(putResponse.body).toEqual({ productSlugs: [validProduct.slug] })

		const getResponse = await request(app.getHttpServer()).get(base).set('Cookie', cookie)
		expect(getResponse.body).toEqual({ productSlugs: [validProduct.slug] })
	})

	test('a favorite added under store A never appears in store B GET response for the same customer', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'Store A', slug: 'store-a-favorites' } }),
			prisma.store.create({ data: { name: 'Store B', slug: 'store-b-favorites' } }),
		])
		const productA = await createProduct(prisma, storeA.id, 'produto-loja-a', 'ACTIVE')
		const { cookie } = await authenticateCustomer(app, prisma)

		await request(app.getHttpServer())
			.post(`/api/v1/stores/${storeA.slug}/account/favorites/${productA.slug}`)
			.set('Cookie', cookie)

		const storeAResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${storeA.slug}/account/favorites`)
			.set('Cookie', cookie)
		expect(storeAResponse.body).toEqual({ productSlugs: [productA.slug] })

		const storeBResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${storeB.slug}/account/favorites`)
			.set('Cookie', cookie)
		expect(storeBResponse.body).toEqual({ productSlugs: [] })
	})

	test('rejects an unauthenticated request with 401', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Auth', slug: 'quintal-auth-favorites' },
		})

		const response = await request(app.getHttpServer()).get(
			`/api/v1/stores/${store.slug}/account/favorites`,
		)

		expect(response.statusCode).toBe(401)
	})

	test('rejects a store-member (not customer) session with 403', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)

		const response = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/favorites`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(403)
	})
})
