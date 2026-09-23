import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
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

async function authenticateAdmin(app: INestApplication, prisma: PrismaService, email: string) {
	const { store, cookie } = await authenticateStoreMember(app, prisma, { email })

	return { store, cookie }
}

describe('Merchandising admin API (E2E)', () => {
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

	test('admin can configure home categories and featured products, then read the shaped payload', async () => {
		const owner = await authenticateAdmin(app, prisma, 'merch-admin@quintal.test')
		const [dogsDepartment, catsDepartment, agroDepartment] = await Promise.all([
			prisma.category.create({
				data: { storeId: owner.store.id, name: 'Dogs', slug: 'dogs' },
			}),
			prisma.category.create({
				data: { storeId: owner.store.id, name: 'Cats', slug: 'cats' },
			}),
			prisma.category.create({
				data: { storeId: owner.store.id, name: 'Farm', slug: 'farm' },
			}),
		])
		const [dog1, dog2, cat1, agro1] = await Promise.all([
			prisma.category.create({
				data: {
					storeId: owner.store.id,
					parentCategoryId: dogsDepartment.id,
					name: 'Dog Food',
					slug: 'dog-food',
				},
			}),
			prisma.category.create({
				data: {
					storeId: owner.store.id,
					parentCategoryId: dogsDepartment.id,
					name: 'Dog Toys',
					slug: 'dog-toys',
				},
			}),
			prisma.category.create({
				data: {
					storeId: owner.store.id,
					parentCategoryId: catsDepartment.id,
					name: 'Cat Litter',
					slug: 'cat-litter',
				},
			}),
			prisma.category.create({
				data: {
					storeId: owner.store.id,
					parentCategoryId: agroDepartment.id,
					name: 'Farm Feed',
					slug: 'farm-feed',
				},
			}),
		])
		const [product1, product2] = await Promise.all([
			prisma.product.create({
				data: {
					storeId: owner.store.id,
					name: 'Racao Premium',
					slug: 'racao-premium',
					status: 'ACTIVE',
				},
			}),
			prisma.product.create({
				data: {
					storeId: owner.store.id,
					name: 'Areia Premium',
					slug: 'areia-premium',
					status: 'ACTIVE',
				},
			}),
		])

		const categoriesResponse = await request(app.getHttpServer())
			.put('/api/v1/admin/merchandising/home/featured-categories')
			.set('Cookie', owner.cookie)
			.send({
				featuredCategoryIds: [dog2.id, dog1.id, cat1.id, agro1.id],
			})

		expect(categoriesResponse.statusCode).toBe(200)
		expect(categoriesResponse.body).toEqual({
			featuredCategories: [
				{
					categoryId: dog2.id,
					position: 0,
					name: 'Dog Toys',
					slug: 'dog-toys',
					parentId: dogsDepartment.id,
				},
				{
					categoryId: dog1.id,
					position: 1,
					name: 'Dog Food',
					slug: 'dog-food',
					parentId: dogsDepartment.id,
				},
				{
					categoryId: cat1.id,
					position: 2,
					name: 'Cat Litter',
					slug: 'cat-litter',
					parentId: catsDepartment.id,
				},
				{
					categoryId: agro1.id,
					position: 3,
					name: 'Farm Feed',
					slug: 'farm-feed',
					parentId: agroDepartment.id,
				},
			],
		})

		const productsResponse = await request(app.getHttpServer())
			.put('/api/v1/admin/merchandising/home/featured-products')
			.set('Cookie', owner.cookie)
			.send({
				featuredProductIds: [product1.id, product2.id],
			})

		expect(productsResponse.statusCode).toBe(200)
		expect(productsResponse.body).toEqual({
			featuredProducts: [
				{ productId: product1.id, position: 0, name: 'Racao Premium', slug: 'racao-premium' },
				{ productId: product2.id, position: 1, name: 'Areia Premium', slug: 'areia-premium' },
			],
		})

		const getResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/merchandising/home')
			.set('Cookie', owner.cookie)

		expect(getResponse.statusCode).toBe(200)
		expect(getResponse.body).toEqual({
			featuredCategories: categoriesResponse.body.featuredCategories,
			featuredProducts: productsResponse.body.featuredProducts,
		})
	})

	test('per-department category limit and featured-product limit are enforced', async () => {
		const owner = await authenticateAdmin(app, prisma, 'limits-merch@quintal.test')
		const dogsDepartment = await prisma.category.create({
			data: { storeId: owner.store.id, name: 'Dogs', slug: 'dogs' },
		})
		const dogCategories = await Promise.all(
			Array.from({ length: 4 }, (_, index) =>
				prisma.category.create({
					data: {
						storeId: owner.store.id,
						parentCategoryId: dogsDepartment.id,
						name: `Dog ${index + 1}`,
						slug: `dog-${index + 1}`,
					},
				}),
			),
		)
		const products = await Promise.all(
			Array.from({ length: 9 }, (_, index) =>
				prisma.product.create({
					data: {
						storeId: owner.store.id,
						name: `Product ${index + 1}`,
						slug: `product-${index + 1}`,
						status: 'ACTIVE',
					},
				}),
			),
		)

		const categoriesResponse = await request(app.getHttpServer())
			.put('/api/v1/admin/merchandising/home/featured-categories')
			.set('Cookie', owner.cookie)
			.send({
				featuredCategoryIds: dogCategories.map((category) => category.id),
			})

		expect(categoriesResponse.statusCode).toBe(400)
		// The raw domain message ("Featured category references cannot exceed 3
		// items.") must never reach the operator verbatim. See T5.
		expect(categoriesResponse.body).toEqual({
			code: 'MERCHANDISING_LIMIT_EXCEEDED',
			message: 'Você já atingiu o limite de 3 categorias em destaque.',
		})

		const productsResponse = await request(app.getHttpServer())
			.put('/api/v1/admin/merchandising/home/featured-products')
			.set('Cookie', owner.cookie)
			.send({
				featuredProductIds: products.map((product) => product.id),
			})

		expect(productsResponse.statusCode).toBe(400)
		expect(productsResponse.body).toEqual({
			code: 'MERCHANDISING_LIMIT_EXCEEDED',
			message: 'Você já atingiu o limite de 8 produtos em destaque.',
		})
	})

	test('admin configuration rejects foreign store references', async () => {
		const owner = await authenticateAdmin(app, prisma, 'owner-merch@quintal.test')
		const foreignOwner = await authenticateAdmin(app, prisma, 'foreign-merch@quintal.test')
		const localCategory = await prisma.category.create({
			data: {
				storeId: owner.store.id,
				name: 'Local',
				slug: 'local',
			},
		})
		const foreignProduct = await prisma.product.create({
			data: {
				storeId: foreignOwner.store.id,
				name: 'Foreign Product',
				slug: 'foreign-product',
				status: 'ACTIVE',
			},
		})

		const categoriesResponse = await request(app.getHttpServer())
			.put('/api/v1/admin/merchandising/home/featured-categories')
			.set('Cookie', owner.cookie)
			.send({
				featuredCategoryIds: [localCategory.id, localCategory.id],
			})

		expect(categoriesResponse.statusCode).toBe(400)
		expect(categoriesResponse.body).toEqual({
			code: 'INVALID_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque devem pertencer à loja atual.',
		})

		const productsResponse = await request(app.getHttpServer())
			.put('/api/v1/admin/merchandising/home/featured-products')
			.set('Cookie', owner.cookie)
			.send({
				featuredProductIds: [foreignProduct.id],
			})

		expect(productsResponse.statusCode).toBe(400)
		expect(productsResponse.body).toEqual({
			code: 'INVALID_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque devem pertencer à loja atual.',
		})
	})
})
