import { createApp } from '@/infra/app.factory'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.merchandisingFeaturedProduct.deleteMany()
	await prisma.merchandisingFeaturedCategory.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
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
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

describe('Platform hardening (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeEach(async () => {
		app = await createApp()
		prisma = app.get(PrismaService)
		await app.init()
		await resetDatabase(prisma)
	})

	afterEach(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	test('Swagger is centered on Quintal Agro Pet runtime and no longer advertises legacy billing routes', async () => {
		const response = await request(app.getHttpServer()).get('/docs-json')

		expect(response.statusCode).toBe(200)
		expect(response.body.info).toMatchObject({
			title: 'Quintal Agro Pet API',
		})
		expect(response.body.paths).toEqual(
			expect.objectContaining({
				'/health': expect.any(Object),
				'/api/v1/admin/me': expect.any(Object),
				'/api/v1/admin/catalog/brands': expect.any(Object),
				'/api/v1/admin/inventory/variants/{variantId}': expect.any(Object),
				'/api/v1/admin/merchandising/home': expect.any(Object),
				'/api/v1/storefront/home': expect.any(Object),
				'/api/v1/storefront/search': expect.any(Object),
				'/api/v1/platform/bounded-contexts': expect.any(Object),
			}),
		)
		expect(response.body.paths['/members']).toBeUndefined()
		expect(response.body.paths['/invoices']).toBeUndefined()
		expect(response.body.paths['/subscription-plans']).toBeUndefined()
	})

	test('legacy business routes are removed while Quintal Agro Pet routes stay active', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma, {
			storeName: 'Quintal Runtime',
			storeSlug: 'quintal-runtime',
			email: 'runtime-admin@quintal.test',
		})

		const legacyResponse = await request(app.getHttpServer()).get('/members')
		expect(legacyResponse.statusCode).toBe(404)

		const meResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/me')
			.set('Cookie', cookie)

		expect(meResponse.statusCode).toBe(200)
		expect(meResponse.body.store.slug).toBe(store.slug)

		const storefrontResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/home?store=${store.slug}`,
		)

		expect(storefrontResponse.statusCode).toBe(200)
		expect(storefrontResponse.body).toEqual({
			featuredCategories: [],
			featuredProducts: [],
		})
	})
})
