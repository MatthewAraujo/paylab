import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()

async function resetDatabase() {
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

describe('Prisma catalog schema invariants', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('product, category, and brand slugs are unique per store and reusable across stores', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({
				data: { name: 'Quintal Norte', slug: 'quintal-norte' },
			}),
			prisma.store.create({
				data: { name: 'Quintal Sul', slug: 'quintal-sul' },
			}),
		])

		const [brandA, categoryA] = await Promise.all([
			prisma.brand.create({
				data: {
					storeId: storeA.id,
					name: 'Premier Pet',
					slug: 'premier-pet',
				},
			}),
			prisma.category.create({
				data: {
					storeId: storeA.id,
					name: 'Racoes',
					slug: 'racoes',
				},
			}),
		])

		await prisma.product.create({
			data: {
				storeId: storeA.id,
				name: 'Racao Senior',
				slug: 'racao-senior',
				brandId: brandA.id,
				primaryCategoryId: categoryA.id,
			},
		})

		await expect(
			prisma.brand.create({
				data: {
					storeId: storeA.id,
					name: 'Premier Clone',
					slug: 'premier-pet',
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		await expect(
			prisma.category.create({
				data: {
					storeId: storeA.id,
					name: 'Racoes Clone',
					slug: 'racoes',
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		await expect(
			prisma.product.create({
				data: {
					storeId: storeA.id,
					name: 'Racao Senior Clone',
					slug: 'racao-senior',
					brandId: brandA.id,
					primaryCategoryId: categoryA.id,
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		await expect(
			prisma.brand.create({
				data: {
					storeId: storeB.id,
					name: 'Premier Pet',
					slug: 'premier-pet',
				},
			}),
		).resolves.toMatchObject({ storeId: storeB.id })

		await expect(
			prisma.category.create({
				data: {
					storeId: storeB.id,
					name: 'Racoes',
					slug: 'racoes',
				},
			}),
		).resolves.toMatchObject({ storeId: storeB.id })

		const brandB = await prisma.brand.findFirstOrThrow({
			where: { storeId: storeB.id, slug: 'premier-pet' },
		})
		const categoryB = await prisma.category.findFirstOrThrow({
			where: { storeId: storeB.id, slug: 'racoes' },
		})

		await expect(
			prisma.product.create({
				data: {
					storeId: storeB.id,
					name: 'Racao Senior',
					slug: 'racao-senior',
					brandId: brandB.id,
					primaryCategoryId: categoryB.id,
				},
			}),
		).resolves.toMatchObject({ storeId: storeB.id })
	})

	test('variant SKU is unique per store and reusable across stores', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({
				data: { name: 'SKU Norte', slug: 'sku-norte' },
			}),
			prisma.store.create({
				data: { name: 'SKU Sul', slug: 'sku-sul' },
			}),
		])

		const [brandA, categoryA] = await Promise.all([
			prisma.brand.create({
				data: { storeId: storeA.id, name: 'Marca A', slug: 'marca-a' },
			}),
			prisma.category.create({
				data: { storeId: storeA.id, name: 'Categoria A', slug: 'categoria-a' },
			}),
		])

		const [brandB, categoryB] = await Promise.all([
			prisma.brand.create({
				data: { storeId: storeB.id, name: 'Marca B', slug: 'marca-b' },
			}),
			prisma.category.create({
				data: { storeId: storeB.id, name: 'Categoria B', slug: 'categoria-b' },
			}),
		])

		const [productA1, productA2, productB1] = await Promise.all([
			prisma.product.create({
				data: {
					storeId: storeA.id,
					name: 'Produto A1',
					slug: 'produto-a1',
					brandId: brandA.id,
					primaryCategoryId: categoryA.id,
				},
			}),
			prisma.product.create({
				data: {
					storeId: storeA.id,
					name: 'Produto A2',
					slug: 'produto-a2',
					brandId: brandA.id,
					primaryCategoryId: categoryA.id,
				},
			}),
			prisma.product.create({
				data: {
					storeId: storeB.id,
					name: 'Produto B1',
					slug: 'produto-b1',
					brandId: brandB.id,
					primaryCategoryId: categoryB.id,
				},
			}),
		])

		await prisma.productVariant.create({
			data: {
				storeId: storeA.id,
				productId: productA1.id,
				name: '15kg',
				sku: 'SKU-001',
				priceCents: 25990,
			},
		})

		await expect(
			prisma.productVariant.create({
				data: {
					storeId: storeA.id,
					productId: productA2.id,
					name: '20kg',
					sku: 'SKU-001',
					priceCents: 27990,
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		await expect(
			prisma.productVariant.create({
				data: {
					storeId: storeB.id,
					productId: productB1.id,
					name: '15kg',
					sku: 'SKU-001',
					priceCents: 25990,
				},
			}),
		).resolves.toMatchObject({ storeId: storeB.id })
	})

	test('product supports multiple categories while keeping one primary category', async () => {
		const store = await prisma.store.create({
			data: { name: 'Multi Categoria', slug: 'multi-categoria' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Marca Multi', slug: 'marca-multi' },
		})
		const [primaryCategory, secondaryCategory] = await Promise.all([
			prisma.category.create({
				data: { storeId: store.id, name: 'Caes', slug: 'caes' },
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Premium', slug: 'premium' },
			}),
		])

		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Racao Premium Caes',
				slug: 'racao-premium-caes',
				brandId: brand.id,
				primaryCategoryId: primaryCategory.id,
				categories: {
					create: [
						{
							storeId: store.id,
							categoryId: primaryCategory.id,
						},
						{
							storeId: store.id,
							categoryId: secondaryCategory.id,
						},
					],
				},
			},
			include: {
				categories: {
					orderBy: { categoryId: 'asc' },
				},
			},
		})

		expect(product.primaryCategoryId).toBe(primaryCategory.id)
		expect(product.categories).toHaveLength(2)
		expect(product.categories.map((item) => item.categoryId).sort()).toEqual(
			[primaryCategory.id, secondaryCategory.id].sort(),
		)
	})

	test('inactive and archived catalog lifecycle states persist correctly', async () => {
		const store = await prisma.store.create({
			data: { name: 'Lifecycle Store', slug: 'lifecycle-store' },
		})
		const [brand, category] = await Promise.all([
			prisma.brand.create({
				data: {
					storeId: store.id,
					name: 'Marca Lifecycle',
					slug: 'marca-lifecycle',
					status: 'INACTIVE',
				},
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Categoria Lifecycle',
					slug: 'categoria-lifecycle',
					status: 'ARCHIVED',
					archivedAt: new Date('2026-08-20T18:00:00.000Z'),
				},
			}),
		])

		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Produto Lifecycle',
				slug: 'produto-lifecycle',
				brandId: brand.id,
				primaryCategoryId: category.id,
				status: 'INACTIVE',
				deactivatedAt: new Date('2026-08-20T18:10:00.000Z'),
			},
		})

		const variant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: '1kg',
				sku: 'LIFE-001',
				status: 'INACTIVE',
				priceCents: 1990,
				deactivatedAt: new Date('2026-08-20T18:20:00.000Z'),
			},
		})

		expect(brand.status).toBe('INACTIVE')
		expect(category.status).toBe('ARCHIVED')
		expect(category.archivedAt?.toISOString()).toBe('2026-08-20T18:00:00.000Z')
		expect(product.status).toBe('INACTIVE')
		expect(product.deactivatedAt?.toISOString()).toBe('2026-08-20T18:10:00.000Z')
		expect(variant.status).toBe('INACTIVE')
		expect(variant.deactivatedAt?.toISOString()).toBe('2026-08-20T18:20:00.000Z')
	})
})
