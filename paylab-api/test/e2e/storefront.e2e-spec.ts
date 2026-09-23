import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

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
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

describe('Storefront API (E2E)', () => {
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

	test('storefront home returns public merchandising payload filtered by active catalog visibility', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Publico', slug: 'quintal-publico' },
		})

		const [dog, cat, hiddenCategory, emptyVisibleDepartment, hiddenRootDepartment] =
			await Promise.all([
				prisma.category.create({
					data: {
						storeId: store.id,
						name: 'Dogs',
						slug: 'dogs',
						status: 'ACTIVE',
						isVisibleOnHome: true,
					},
				}),
				prisma.category.create({
					data: {
						storeId: store.id,
						name: 'Cats',
						slug: 'cats',
						status: 'ACTIVE',
						isVisibleOnHome: true,
					},
				}),
				prisma.category.create({
					data: {
						storeId: store.id,
						name: 'Archived Agro',
						slug: 'archived-agro',
						status: 'ARCHIVED',
						isVisibleOnHome: true,
					},
				}),
				// A root category marked visible but with nothing curated under it is an
				// intentional empty state (must still appear, with an empty categories
				// list) — distinct from a root category that simply isn't visible.
				prisma.category.create({
					data: {
						storeId: store.id,
						name: 'Birds',
						slug: 'birds',
						status: 'ACTIVE',
						isVisibleOnHome: true,
					},
				}),
				// An ACTIVE root category NOT marked visible on home must never appear as
				// a department at all — this is the bug T3 fixes ("Acessórios" showing up
				// as an empty department just for being an active root category).
				prisma.category.create({
					data: {
						storeId: store.id,
						name: 'Acessorios',
						slug: 'acessorios',
						status: 'ACTIVE',
						isVisibleOnHome: false,
					},
				}),
			])

		const [hiddenChildOfDog, visibleChildOfDog] = await Promise.all([
			// Featured in merchandising but explicitly hidden — must not show under Dogs.
			prisma.category.create({
				data: {
					storeId: store.id,
					parentCategoryId: dog.id,
					name: 'Racao Molhada',
					slug: 'racao-molhada',
					status: 'ACTIVE',
					isVisibleOnHome: false,
				},
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					parentCategoryId: dog.id,
					name: 'Racao Seca',
					slug: 'racao-seca',
					status: 'ACTIVE',
					isVisibleOnHome: true,
				},
			}),
		])

		const brand = await prisma.brand.create({
			data: {
				storeId: store.id,
				name: 'Golden',
				slug: 'golden',
				status: 'ACTIVE',
			},
		})
		const visibleProductAttachment = await prisma.attachment.create({
			data: {
				storeId: store.id,
				title: 'racao.png',
				url: 'https://cdn.example.com/racao.png',
			},
		})

		const [visibleProduct, hiddenProduct, soldOutFeaturedProduct] = await Promise.all([
			prisma.product.create({
				data: {
					storeId: store.id,
					brandId: brand.id,
					primaryCategoryId: dog.id,
					name: 'Racao Premium',
					slug: 'racao-premium',
					status: 'ACTIVE',
					categories: {
						create: [{ storeId: store.id, categoryId: dog.id }],
					},
					variants: {
						create: [
							{
								storeId: store.id,
								name: '10kg',
								sku: 'RACAO-10',
								status: 'ACTIVE',
								priceCents: 15990,
								inventoryItem: {
									create: { storeId: store.id, availableQuantity: 8 },
								},
							},
						],
					},
					images: {
						create: [
							{
								storeId: store.id,
								attachmentId: visibleProductAttachment.id,
								url: 'https://cdn.example.com/racao.png',
								position: 0,
								isPrimary: true,
							},
						],
					},
				},
			}),
			prisma.product.create({
				data: {
					storeId: store.id,
					name: 'Produto Oculto',
					slug: 'produto-oculto',
					status: 'INACTIVE',
				},
			}),
			// ACTIVE but every variant is sold out — must be dropped from the home
			// featured feed even though it is explicitly curated. See ADR 0006.
			prisma.product.create({
				data: {
					storeId: store.id,
					name: 'Racao Esgotada',
					slug: 'racao-esgotada',
					status: 'ACTIVE',
					variants: {
						create: [
							{
								storeId: store.id,
								name: '10kg',
								sku: 'RACAO-ESG-10',
								status: 'ACTIVE',
								priceCents: 15990,
								inventoryItem: {
									create: { storeId: store.id, availableQuantity: 0 },
								},
							},
						],
					},
				},
			}),
		])

		await prisma.merchandisingFeaturedCategory.createMany({
			data: [
				{
					storeId: store.id,
					categoryId: dog.id,
					position: 0,
				},
				{
					storeId: store.id,
					categoryId: cat.id,
					position: 1,
				},
				{
					storeId: store.id,
					categoryId: hiddenCategory.id,
					position: 2,
				},
				{
					storeId: store.id,
					categoryId: hiddenChildOfDog.id,
					position: 3,
				},
				{
					storeId: store.id,
					categoryId: visibleChildOfDog.id,
					position: 4,
				},
			],
		})

		await prisma.merchandisingFeaturedProduct.createMany({
			data: [
				{
					storeId: store.id,
					productId: visibleProduct.id,
					position: 0,
				},
				{
					storeId: store.id,
					productId: hiddenProduct.id,
					position: 1,
				},
				{
					storeId: store.id,
					productId: soldOutFeaturedProduct.id,
					position: 2,
				},
			],
		})

		const response = await request(app.getHttpServer()).get(
			`/api/v1/storefront/home?store=${store.slug}`,
		)

		expect(response.statusCode).toBe(200)
		// "Acessórios": an ACTIVE root category not marked visible on home must never
		// appear as a department, empty or otherwise — this is the exact bug T3 fixes.
		expect(
			response.body.featuredCategories.some(
				(department: { departmentId: string }) =>
					department.departmentId === hiddenRootDepartment.id,
			),
		).toBe(false)
		// A curated-but-sold-out product is dropped from the featured feed, while the
		// featured categories are unaffected. See ADR 0006.
		expect(
			response.body.featuredProducts.some(
				(product: { slug: string }) => product.slug === 'racao-esgotada',
			),
		).toBe(false)
		expect(
			response.body.featuredCategories.some(
				(department: { slug: string }) => department.slug === 'dogs',
			),
		).toBe(true)
		expect(response.body).toEqual({
			featuredCategories: [
				{
					// Visible root with nothing curated under it: an intentional empty
					// state, not the "Acessórios" bug (which never appears at all, below).
					departmentId: emptyVisibleDepartment.id,
					name: 'Birds',
					slug: 'birds',
					imageUrl: null,
					categories: [],
				},
				{
					departmentId: cat.id,
					name: 'Cats',
					slug: 'cats',
					imageUrl: null,
					categories: [{ categoryId: cat.id, name: 'Cats', slug: 'cats', imageUrl: null }],
				},
				{
					departmentId: dog.id,
					name: 'Dogs',
					slug: 'dogs',
					imageUrl: null,
					categories: [
						{ categoryId: dog.id, name: 'Dogs', slug: 'dogs', imageUrl: null },
						{
							categoryId: visibleChildOfDog.id,
							name: 'Racao Seca',
							slug: 'racao-seca',
							imageUrl: null,
						},
					],
				},
			],
			featuredProducts: [
				{
					productId: visibleProduct.id,
					name: 'Racao Premium',
					slug: 'racao-premium',
					description: null,
					brand: {
						name: 'Golden',
						slug: 'golden',
						logoUrl: null,
					},
					primaryImage: {
						url: 'https://cdn.example.com/racao.png',
						altText: null,
					},
					priceRange: {
						minPriceCents: 15990,
						maxPriceCents: 15990,
					},
					inStock: true,
				},
			],
		})
	})

	test('storefront product listing stays public, filterable by slug references, and excludes inactive entities', async () => {
		const [store, foreignStore] = await Promise.all([
			prisma.store.create({
				data: { name: 'Quintal Norte', slug: 'quintal-norte' },
			}),
			prisma.store.create({
				data: { name: 'Quintal Sul', slug: 'quintal-sul' },
			}),
		])

		const [brand, foreignBrand, category, hiddenCategory] = await Promise.all([
			prisma.brand.create({
				data: { storeId: store.id, name: 'Golden', slug: 'golden', status: 'ACTIVE' },
			}),
			prisma.brand.create({
				data: {
					storeId: foreignStore.id,
					name: 'Golden Sul',
					slug: 'golden',
					status: 'ACTIVE',
				},
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Racoes', slug: 'racoes', status: 'ACTIVE' },
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Oculta',
					slug: 'oculta',
					status: 'INACTIVE',
				},
			}),
		])

		const frangoAttachment = await prisma.attachment.create({
			data: {
				storeId: store.id,
				title: 'frango.png',
				url: 'https://cdn.example.com/frango.png',
			},
		})

		const visibleProduct = await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: category.id,
				name: 'Racao Frango',
				slug: 'racao-frango',
				description: 'Super premium',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: category.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '10kg',
							sku: 'FRANGO-10',
							status: 'ACTIVE',
							priceCents: 10990,
							inventoryItem: {
								create: {
									storeId: store.id,
									availableQuantity: 0,
								},
							},
						},
						{
							storeId: store.id,
							name: '20kg',
							sku: 'FRANGO-20',
							status: 'ACTIVE',
							priceCents: 18990,
							inventoryItem: {
								create: {
									storeId: store.id,
									availableQuantity: 4,
								},
							},
						},
					],
				},
				images: {
					create: [
						{
							storeId: store.id,
							attachmentId: frangoAttachment.id,
							url: 'https://cdn.example.com/frango.png',
							position: 0,
							isPrimary: true,
						},
					],
				},
			},
		})

		const seniorMainAttachment = await prisma.attachment.create({
			data: {
				storeId: store.id,
				title: 'senior-main.png',
				url: 'https://cdn.example.com/senior-main.png',
			},
		})
		const seniorBackAttachment = await prisma.attachment.create({
			data: {
				storeId: store.id,
				title: 'senior-back.png',
				url: 'https://cdn.example.com/senior-back.png',
			},
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: hiddenCategory.id,
				name: 'Produto Inativo',
				slug: 'produto-inativo',
				status: 'INACTIVE',
			},
		})

		await prisma.product.create({
			data: {
				storeId: foreignStore.id,
				brandId: foreignBrand.id,
				name: 'Produto Sul',
				slug: 'produto-sul',
				status: 'ACTIVE',
			},
		})

		// ACTIVE, same brand + category as the visible product, but fully out of
		// stock — must not appear in the listing nor count toward pagination.
		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: category.id,
				name: 'Racao Esgotada',
				slug: 'racao-esgotada',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: category.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '10kg',
							sku: 'FRANGO-ESG-10',
							status: 'ACTIVE',
							priceCents: 10990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 0 },
							},
						},
					],
				},
			},
		})

		const response = await request(app.getHttpServer()).get(
			`/api/v1/storefront/products?store=${store.slug}&category=${category.slug}&brand=${brand.slug}`,
		)

		expect(response.statusCode).toBe(200)
		expect(
			response.body.items.some((item: { slug: string }) => item.slug === 'racao-esgotada'),
		).toBe(false)
		expect(response.body).toEqual({
			items: [
				{
					name: 'Racao Frango',
					slug: 'racao-frango',
					description: 'Super premium',
					brand: {
						name: 'Golden',
						slug: 'golden',
						logoUrl: null,
					},
					primaryCategory: {
						name: 'Racoes',
						slug: 'racoes',
					},
					primaryImage: {
						url: 'https://cdn.example.com/frango.png',
						altText: null,
					},
					priceRange: {
						minPriceCents: 10990,
						maxPriceCents: 18990,
					},
					inStock: true,
					variants: [
						{
							id: expect.any(String),
							name: '10kg',
							priceCents: 10990,
							attributes: {},
							availableQuantity: 0,
							inStock: false,
						},
						{
							id: expect.any(String),
							name: '20kg',
							priceCents: 18990,
							attributes: {},
							availableQuantity: 4,
							inStock: true,
						},
					],
				},
			],
			pagination: {
				page: 1,
				limit: 24,
				total: 1,
				totalPages: 1,
			},
		})

		expect(response.body.items[0]).not.toHaveProperty('id')
		expect(response.body.items[0]).not.toHaveProperty('storeId')
		expect(visibleProduct.status).toBe('ACTIVE')
	})

	test('storefront product detail is slug-based and returns only public fields', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Detail', slug: 'quintal-detail' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Premier', slug: 'premier', status: 'ACTIVE' },
		})
		const [parentCategory, category] = await Promise.all([
			prisma.category.create({
				data: { storeId: store.id, name: 'Dogs', slug: 'dogs', status: 'ACTIVE' },
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					parentCategoryId: undefined,
					name: 'Racoes',
					slug: 'racoes',
					status: 'ACTIVE',
				},
			}),
		])
		await prisma.category.update({
			where: { id: category.id },
			data: { parentCategoryId: parentCategory.id },
		})
		const seniorMainAttachment = await prisma.attachment.create({
			data: {
				storeId: store.id,
				title: 'senior-main.png',
				url: 'https://cdn.example.com/senior-main.png',
			},
		})
		const seniorBackAttachment = await prisma.attachment.create({
			data: {
				storeId: store.id,
				title: 'senior-back.png',
				url: 'https://cdn.example.com/senior-back.png',
			},
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: category.id,
				name: 'Racao Senior',
				slug: 'racao-senior',
				description: 'Formula senior',
				status: 'ACTIVE',
				categories: {
					create: [
						{ storeId: store.id, categoryId: parentCategory.id },
						{ storeId: store.id, categoryId: category.id },
					],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '10kg',
							sku: 'SENIOR-10',
							status: 'ACTIVE',
							priceCents: 12990,
							attributes: { weight: '10kg' },
							inventoryItem: {
								create: {
									storeId: store.id,
									availableQuantity: 3,
								},
							},
						},
						{
							storeId: store.id,
							name: '5kg legado',
							sku: 'SENIOR-5',
							status: 'INACTIVE',
							priceCents: 8990,
						},
					],
				},
				images: {
					create: [
						{
							storeId: store.id,
							attachmentId: seniorMainAttachment.id,
							url: 'https://cdn.example.com/senior-main.png',
							position: 0,
							isPrimary: true,
						},
						{
							storeId: store.id,
							attachmentId: seniorBackAttachment.id,
							url: 'https://cdn.example.com/senior-back.png',
							position: 1,
							isPrimary: false,
						},
					],
				},
			},
		})

		const response = await request(app.getHttpServer()).get(
			`/api/v1/storefront/products/racao-senior?store=${store.slug}`,
		)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			name: 'Racao Senior',
			slug: 'racao-senior',
			description: 'Formula senior',
			brand: {
				name: 'Premier',
				slug: 'premier',
				logoUrl: null,
			},
			primaryCategory: {
				name: 'Racoes',
				slug: 'racoes',
			},
			primaryCategoryPath: [
				{ name: 'Dogs', slug: 'dogs' },
				{ name: 'Racoes', slug: 'racoes' },
			],
			categories: [
				{ name: 'Dogs', slug: 'dogs' },
				{ name: 'Racoes', slug: 'racoes' },
			],
			images: [
				{
					url: 'https://cdn.example.com/senior-main.png',
					altText: null,
					isPrimary: true,
				},
				{
					url: 'https://cdn.example.com/senior-back.png',
					altText: null,
					isPrimary: false,
				},
			],
			variants: [
				{
					id: expect.any(String),
					name: '10kg',
					priceCents: 12990,
					attributes: { weight: '10kg' },
					availableQuantity: 3,
					inStock: true,
				},
			],
			priceRange: {
				minPriceCents: 12990,
				maxPriceCents: 12990,
			},
			inStock: true,
		})

		expect(response.body).not.toHaveProperty('id')
		expect(response.body.variants[0]).not.toHaveProperty('sku')

		// A sold-out ACTIVE product is hidden from listings but its canonical page
		// still resolves (HTTP 200) with product-level `inStock: false` and the
		// exact same JSON key set as an in-stock product — no new field. See ADR 0006.
		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: category.id,
				name: 'Racao Esgotada',
				slug: 'racao-esgotada',
				description: 'Formula esgotada',
				status: 'ACTIVE',
				variants: {
					create: [
						{
							storeId: store.id,
							name: '10kg',
							sku: 'ESGOTADA-10',
							status: 'ACTIVE',
							priceCents: 12990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 0 },
							},
						},
					],
				},
				images: {
					create: [
						{
							storeId: store.id,
							attachmentId: seniorMainAttachment.id,
							url: 'https://cdn.example.com/senior-main.png',
							position: 0,
							isPrimary: true,
						},
					],
				},
			},
		})

		const soldOutResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/products/racao-esgotada?store=${store.slug}`,
		)

		expect(soldOutResponse.statusCode).toBe(200)
		expect(soldOutResponse.body.inStock).toBe(false)
		expect(soldOutResponse.body.variants).toEqual([
			{
				id: expect.any(String),
				name: '10kg',
				priceCents: 12990,
				attributes: {},
				availableQuantity: 0,
				inStock: false,
			},
		])
		expect(soldOutResponse.body.images).toHaveLength(1)
		expect(soldOutResponse.body.description).toBe('Formula esgotada')
		expect(Object.keys(soldOutResponse.body).sort()).toEqual(Object.keys(response.body).sort())
	})

	test('storefront categories and brands are public slug reads that exclude inactive entities', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Browse', slug: 'quintal-browse' },
		})
		const [brand, hiddenBrand, rootCategory, childCategory, hiddenCategory] = await Promise.all([
			prisma.brand.create({
				data: { storeId: store.id, name: 'Golden', slug: 'golden', status: 'ACTIVE' },
			}),
			prisma.brand.create({
				data: {
					storeId: store.id,
					name: 'Oculta',
					slug: 'oculta',
					status: 'ARCHIVED',
				},
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Dogs', slug: 'dogs', status: 'ACTIVE' },
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Racoes',
					slug: 'racoes',
					parentCategoryId: undefined,
					status: 'ACTIVE',
				},
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Oculta',
					slug: 'oculta',
					status: 'INACTIVE',
				},
			}),
		])
		await prisma.category.update({
			where: { id: childCategory.id },
			data: { parentCategoryId: rootCategory.id },
		})

		// A brand whose only ACTIVE product is fully out of stock must not appear in
		// the brand list — following its link would land on an empty page. See ADR 0006.
		const soldOutBrand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Esgotada', slug: 'esgotada', status: 'ACTIVE' },
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: childCategory.id,
				name: 'Racao Browse',
				slug: 'racao-browse',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: childCategory.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: 'Default',
							sku: 'BROWSE-1',
							status: 'ACTIVE',
							priceCents: 9990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 5 },
							},
						},
					],
				},
			},
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: soldOutBrand.id,
				primaryCategoryId: childCategory.id,
				name: 'Racao Esgotada Brand',
				slug: 'racao-esgotada-brand',
				status: 'ACTIVE',
				variants: {
					create: [
						{
							storeId: store.id,
							name: 'Default',
							sku: 'BROWSE-ESG-1',
							status: 'ACTIVE',
							priceCents: 9990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 0 },
							},
						},
					],
				},
			},
		})

		const categoriesResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/categories?store=${store.slug}`,
		)
		expect(categoriesResponse.statusCode).toBe(200)
		expect(categoriesResponse.body).toEqual({
			items: [
				{
					name: 'Dogs',
					slug: 'dogs',
					imageUrl: null,
					isVisibleOnHome: false,
					parentSlug: null,
				},
				{
					name: 'Racoes',
					slug: 'racoes',
					imageUrl: null,
					isVisibleOnHome: false,
					parentSlug: 'dogs',
				},
			],
		})

		const categoryDetailResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/categories/racoes?store=${store.slug}`,
		)
		expect(categoryDetailResponse.statusCode).toBe(200)
		expect(categoryDetailResponse.body).toEqual({
			name: 'Racoes',
			slug: 'racoes',
			imageUrl: null,
			parentCategory: {
				name: 'Dogs',
				slug: 'dogs',
			},
			breadcrumb: [
				{ name: 'Dogs', slug: 'dogs' },
				{ name: 'Racoes', slug: 'racoes' },
			],
			childCategories: [],
		})

		const brandsResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/brands?store=${store.slug}`,
		)
		expect(brandsResponse.statusCode).toBe(200)
		expect(brandsResponse.body).toEqual({
			items: [{ name: 'Golden', slug: 'golden', logoUrl: null }],
		})

		const hiddenCategoryResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/categories/${hiddenCategory.slug}?store=${store.slug}`,
		)
		expect(hiddenCategoryResponse.statusCode).toBe(404)

		const hiddenBrandList = brandsResponse.body.items.find(
			(item: { slug: string }) => item.slug === hiddenBrand.slug,
		)
		expect(hiddenBrandList).toBeUndefined()

		expect(
			brandsResponse.body.items.some((item: { slug: string }) => item.slug === soldOutBrand.slug),
		).toBe(false)
	})

	test('storefront search finds active products by name and respects store-scoped slug filters', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Search', slug: 'quintal-search' },
		})
		const [brand, category, otherCategory] = await Promise.all([
			prisma.brand.create({
				data: { storeId: store.id, name: 'Golden', slug: 'golden', status: 'ACTIVE' },
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Racoes', slug: 'racoes', status: 'ACTIVE' },
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Petiscos', slug: 'petiscos', status: 'ACTIVE' },
			}),
		])

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: category.id,
				name: 'Racao Golden Senior',
				slug: 'racao-golden-senior',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: category.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '15kg',
							sku: 'GOLDEN-15',
							status: 'ACTIVE',
							priceCents: 19990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 12 },
							},
						},
					],
				},
			},
		})

		// ACTIVE, name matches the search term, but fully out of stock — search
		// must not return it. See ADR 0006.
		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: category.id,
				name: 'Racao Golden Esgotada',
				slug: 'racao-golden-esgotada',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: category.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '15kg',
							sku: 'GOLDEN-ESG-15',
							status: 'ACTIVE',
							priceCents: 19990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 0 },
							},
						},
					],
				},
			},
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: otherCategory.id,
				name: 'Petisco Golden',
				slug: 'petisco-golden',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: otherCategory.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '500g',
							sku: 'PETISCO-500',
							status: 'ACTIVE',
							priceCents: 2990,
						},
					],
				},
			},
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Golden Legacy',
				slug: 'golden-legacy',
				status: 'INACTIVE',
			},
		})

		const response = await request(app.getHttpServer()).get(
			`/api/v1/storefront/search?store=${store.slug}&q=golden&category=${category.slug}`,
		)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			items: [
				{
					name: 'Racao Golden Senior',
					slug: 'racao-golden-senior',
					description: null,
					brand: {
						name: 'Golden',
						slug: 'golden',
						logoUrl: null,
					},
					primaryCategory: {
						name: 'Racoes',
						slug: 'racoes',
					},
					primaryImage: null,
					priceRange: {
						minPriceCents: 19990,
						maxPriceCents: 19990,
					},
					inStock: true,
					variants: [
						{
							id: expect.any(String),
							name: '15kg',
							priceCents: 19990,
							attributes: {},
							availableQuantity: 12,
							inStock: true,
						},
					],
				},
			],
			pagination: {
				page: 1,
				limit: 24,
				total: 1,
				totalPages: 1,
			},
		})

		const soldOutSearch = await request(app.getHttpServer()).get(
			`/api/v1/storefront/search?store=${store.slug}&q=${encodeURIComponent('Racao Golden Esgotada')}`,
		)

		expect(soldOutSearch.statusCode).toBe(200)
		expect(soldOutSearch.body.items).toEqual([])
		expect(soldOutSearch.body.pagination.total).toBe(0)
	})

	test('storefront detail payloads expose breadcrumb navigation from the category tree', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Navigation', slug: 'quintal-navigation' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Premier', slug: 'premier', status: 'ACTIVE' },
		})
		const root = await prisma.category.create({
			data: { storeId: store.id, name: 'Dogs', slug: 'dogs', status: 'ACTIVE' },
		})
		const mid = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Food',
				slug: 'food',
				status: 'ACTIVE',
				parentCategoryId: root.id,
			},
		})
		const leaf = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Senior',
				slug: 'senior',
				status: 'ACTIVE',
				parentCategoryId: mid.id,
			},
		})
		const child = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Wet Food',
				slug: 'wet-food',
				status: 'ACTIVE',
				parentCategoryId: leaf.id,
			},
		})

		await prisma.product.create({
			data: {
				storeId: store.id,
				brandId: brand.id,
				primaryCategoryId: leaf.id,
				name: 'Senior Prime',
				slug: 'senior-prime',
				status: 'ACTIVE',
				categories: {
					create: [{ storeId: store.id, categoryId: leaf.id }],
				},
				variants: {
					create: [
						{
							storeId: store.id,
							name: '12kg',
							sku: 'PRIME-12',
							status: 'ACTIVE',
							priceCents: 20990,
						},
					],
				},
			},
		})

		const productResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/products/senior-prime?store=${store.slug}`,
		)

		expect(productResponse.statusCode).toBe(200)
		expect(productResponse.body.primaryCategoryPath).toEqual([
			{ name: 'Dogs', slug: 'dogs' },
			{ name: 'Food', slug: 'food' },
			{ name: 'Senior', slug: 'senior' },
		])

		const categoryResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/categories/senior?store=${store.slug}`,
		)

		expect(categoryResponse.statusCode).toBe(200)
		expect(categoryResponse.body).toEqual({
			name: 'Senior',
			slug: 'senior',
			imageUrl: null,
			parentCategory: {
				name: 'Food',
				slug: 'food',
			},
			breadcrumb: [
				{ name: 'Dogs', slug: 'dogs' },
				{ name: 'Food', slug: 'food' },
				{ name: 'Senior', slug: 'senior' },
			],
			childCategories: [
				{
					name: 'Wet Food',
					slug: 'wet-food',
					imageUrl: null,
				},
			],
		})

		expect(categoryResponse.body).not.toHaveProperty('id')
	})
})
