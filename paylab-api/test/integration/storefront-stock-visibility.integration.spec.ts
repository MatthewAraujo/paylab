import { QueryStorefrontUseCase } from '@/domain/quintalpet/application/use-cases/query-storefront'
import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const useCase = new QueryStorefrontUseCase(prisma)

async function resetDatabase() {
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

type SeedVariantOptions = {
	name: string
	sku: string
	status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
	priceCents?: number
	/** `null` means "no InventoryItem row at all". A number creates the row with that quantity. */
	availableQuantity?: number | null
}

async function seedProduct(options: {
	storeId: string
	name: string
	slug: string
	status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
	brandId?: string
	primaryCategoryId?: string
	categoryIds?: string[]
	variants: SeedVariantOptions[]
}) {
	return prisma.product.create({
		data: {
			storeId: options.storeId,
			name: options.name,
			slug: options.slug,
			status: options.status ?? 'ACTIVE',
			brandId: options.brandId,
			primaryCategoryId: options.primaryCategoryId,
			categories: options.categoryIds
				? {
						create: options.categoryIds.map((categoryId) => ({
							storeId: options.storeId,
							categoryId,
						})),
					}
				: undefined,
			variants: {
				create: options.variants.map((variant) => ({
					storeId: options.storeId,
					name: variant.name,
					sku: variant.sku,
					status: variant.status ?? 'ACTIVE',
					priceCents: variant.priceCents ?? 9990,
					inventoryItem:
						variant.availableQuantity === null || variant.availableQuantity === undefined
							? undefined
							: {
									create: {
										storeId: options.storeId,
										availableQuantity: variant.availableQuantity,
									},
								},
				})),
			},
		},
		include: { variants: { include: { inventoryItem: true } } },
	})
}

async function addStock(variantId: string, storeId: string, quantity: number) {
	const existing = await prisma.inventoryItem.findUnique({ where: { variantId } })

	if (existing) {
		await prisma.inventoryItem.update({
			where: { variantId },
			data: { availableQuantity: existing.availableQuantity + quantity },
		})
		return
	}

	await prisma.inventoryItem.create({
		data: { storeId, variantId, availableQuantity: quantity },
	})
}

describe('QueryStorefrontUseCase storefront stock visibility', () => {
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

	async function createStore(slug: string) {
		return prisma.store.create({ data: { name: slug, slug } })
	}

	test('hides a fully sold-out ACTIVE product from listProducts and its pagination total', async () => {
		const store = await createStore('quintal-stock-listing')

		await seedProduct({
			storeId: store.id,
			name: 'Racao Em Estoque',
			slug: 'racao-em-estoque',
			variants: [{ name: '10kg', sku: 'STOCK-A-10', availableQuantity: 5 }],
		})
		await seedProduct({
			storeId: store.id,
			name: 'Racao Esgotada',
			slug: 'racao-esgotada',
			variants: [{ name: '10kg', sku: 'STOCK-B-10', availableQuantity: 0 }],
		})

		const result = await useCase.listProducts({ storeSlug: store.slug, page: 1, limit: 20 })

		expect(result.items.map((item) => item.slug)).toEqual(['racao-em-estoque'])
		expect(result.pagination.total).toBe(1)
		expect(result.pagination.totalPages).toBe(1)
	})

	test('hides a fully sold-out ACTIVE product from searchCatalog', async () => {
		const store = await createStore('quintal-stock-search')

		await seedProduct({
			storeId: store.id,
			name: 'Racao Golden Em Estoque',
			slug: 'racao-golden-em-estoque',
			variants: [{ name: '10kg', sku: 'SEARCH-A-10', availableQuantity: 3 }],
		})
		await seedProduct({
			storeId: store.id,
			name: 'Racao Golden Esgotada',
			slug: 'racao-golden-esgotada',
			variants: [{ name: '10kg', sku: 'SEARCH-B-10', availableQuantity: 0 }],
		})

		const result = await useCase.searchCatalog({
			storeSlug: store.slug,
			searchTerm: 'Racao Golden Esgotada',
			page: 1,
			limit: 20,
		})

		expect(result.items).toEqual([])
		expect(result.pagination.total).toBe(0)
	})

	test('hides a fully sold-out ACTIVE product from a category listing', async () => {
		const store = await createStore('quintal-stock-category')
		const category = await prisma.category.create({
			data: { storeId: store.id, name: 'Racoes', slug: 'racoes', status: 'ACTIVE' },
		})

		await seedProduct({
			storeId: store.id,
			name: 'Racao Categoria Em Estoque',
			slug: 'racao-categoria-em-estoque',
			primaryCategoryId: category.id,
			categoryIds: [category.id],
			variants: [{ name: '10kg', sku: 'CAT-A-10', availableQuantity: 2 }],
		})
		await seedProduct({
			storeId: store.id,
			name: 'Racao Categoria Esgotada',
			slug: 'racao-categoria-esgotada',
			primaryCategoryId: category.id,
			categoryIds: [category.id],
			variants: [{ name: '10kg', sku: 'CAT-B-10', availableQuantity: 0 }],
		})

		const result = await useCase.listProducts({
			storeSlug: store.slug,
			categorySlug: category.slug,
			page: 1,
			limit: 20,
		})

		expect(result.items.map((item) => item.slug)).toEqual(['racao-categoria-em-estoque'])
	})

	test('drops a fully sold-out featured product from getHome without touching featured categories', async () => {
		const store = await createStore('quintal-stock-home')
		const department = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Dogs',
				slug: 'dogs',
				status: 'ACTIVE',
				isVisibleOnHome: true,
			},
		})
		await prisma.merchandisingFeaturedCategory.create({
			data: { storeId: store.id, categoryId: department.id, position: 0 },
		})

		const inStockProduct = await seedProduct({
			storeId: store.id,
			name: 'Racao Home Em Estoque',
			slug: 'racao-home-em-estoque',
			variants: [{ name: '10kg', sku: 'HOME-A-10', availableQuantity: 4 }],
		})
		const soldOutProduct = await seedProduct({
			storeId: store.id,
			name: 'Racao Home Esgotada',
			slug: 'racao-home-esgotada',
			variants: [{ name: '10kg', sku: 'HOME-B-10', availableQuantity: 0 }],
		})

		await prisma.merchandisingFeaturedProduct.createMany({
			data: [
				{ storeId: store.id, productId: inStockProduct.id, position: 0 },
				{ storeId: store.id, productId: soldOutProduct.id, position: 1 },
			],
		})

		const home = await useCase.getHome(store.slug)

		expect(home.featuredProducts.map((product) => product.slug)).toEqual(['racao-home-em-estoque'])
		expect(home.featuredCategories.map((department) => department.slug)).toContain('dogs')
	})

	test('excludes from listBrands a brand whose only ACTIVE product is sold out', async () => {
		const store = await createStore('quintal-stock-brands')
		const [brandWithStock, brandSoldOut] = await Promise.all([
			prisma.brand.create({
				data: { storeId: store.id, name: 'Golden', slug: 'golden', status: 'ACTIVE' },
			}),
			prisma.brand.create({
				data: { storeId: store.id, name: 'Premier', slug: 'premier', status: 'ACTIVE' },
			}),
		])

		await seedProduct({
			storeId: store.id,
			name: 'Racao Golden',
			slug: 'racao-golden',
			brandId: brandWithStock.id,
			variants: [{ name: '10kg', sku: 'BRAND-A-10', availableQuantity: 6 }],
		})
		await seedProduct({
			storeId: store.id,
			name: 'Racao Premier',
			slug: 'racao-premier',
			brandId: brandSoldOut.id,
			variants: [{ name: '10kg', sku: 'BRAND-B-10', availableQuantity: 0 }],
		})

		const result = await useCase.listBrands(store.slug)

		expect(result.items.map((brand) => brand.slug)).toEqual(['golden'])
	})

	test('restocking a hidden product makes it reappear with its ACTIVE status never changing', async () => {
		const store = await createStore('quintal-stock-restock')
		const product = await seedProduct({
			storeId: store.id,
			name: 'Racao Restock',
			slug: 'racao-restock',
			variants: [{ name: '10kg', sku: 'RESTOCK-10', availableQuantity: 0 }],
		})

		const hidden = await useCase.listProducts({ storeSlug: store.slug, page: 1, limit: 20 })
		expect(hidden.items).toEqual([])

		await addStock(product.variants[0].id, store.id, 5)

		const visible = await useCase.listProducts({ storeSlug: store.slug, page: 1, limit: 20 })
		expect(visible.items.map((item) => item.slug)).toEqual(['racao-restock'])

		const reloaded = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
		expect(reloaded.status).toBe('ACTIVE')
		expect(product.status).toBe('ACTIVE')
	})

	test('lists a product with one in-stock and one sold-out ACTIVE variant, and keeps both variants on its page', async () => {
		const store = await createStore('quintal-stock-mixed')
		await seedProduct({
			storeId: store.id,
			name: 'Racao Mista',
			slug: 'racao-mista',
			variants: [
				{ name: '10kg', sku: 'MIXED-10', availableQuantity: 7 },
				{ name: '20kg', sku: 'MIXED-20', availableQuantity: 0 },
			],
		})

		const listing = await useCase.listProducts({ storeSlug: store.slug, page: 1, limit: 20 })
		expect(listing.items.map((item) => item.slug)).toEqual(['racao-mista'])

		const page = await useCase.getProductBySlug('racao-mista', store.slug)
		expect(page.inStock).toBe(true)
		expect(
			page.variants.map((variant) => ({
				name: variant.name,
				availableQuantity: variant.availableQuantity,
				inStock: variant.inStock,
			})),
		).toEqual([
			{ name: '10kg', availableQuantity: 7, inStock: true },
			{ name: '20kg', availableQuantity: 0, inStock: false },
		])
	})

	test('treats a variant with no InventoryItem row as zero stock and hides the product', async () => {
		const store = await createStore('quintal-stock-no-item')
		await seedProduct({
			storeId: store.id,
			name: 'Racao Sem Item',
			slug: 'racao-sem-item',
			variants: [{ name: '10kg', sku: 'NOITEM-10', availableQuantity: null }],
		})

		const result = await useCase.listProducts({ storeSlug: store.slug, page: 1, limit: 20 })
		expect(result.items).toEqual([])
	})

	test('hides an ACTIVE product whose only variant is not ACTIVE', async () => {
		const store = await createStore('quintal-stock-no-active-variant')
		await seedProduct({
			storeId: store.id,
			name: 'Racao Sem Variante Ativa',
			slug: 'racao-sem-variante-ativa',
			variants: [{ name: '10kg', sku: 'INACTVAR-10', status: 'INACTIVE', availableQuantity: 50 }],
		})

		const result = await useCase.listProducts({ storeSlug: store.slug, page: 1, limit: 20 })
		expect(result.items).toEqual([])
	})

	test('still resolves the page of a sold-out ACTIVE product (200, inStock:false, no new field) while an INACTIVE slug 404s', async () => {
		const store = await createStore('quintal-stock-page')
		await seedProduct({
			storeId: store.id,
			name: 'Racao Esgotada Pagina',
			slug: 'racao-esgotada-pagina',
			variants: [{ name: '10kg', sku: 'PAGE-10', availableQuantity: 0 }],
		})
		await seedProduct({
			storeId: store.id,
			name: 'Racao Inativa Pagina',
			slug: 'racao-inativa-pagina',
			status: 'INACTIVE',
			variants: [{ name: '10kg', sku: 'PAGE-INACT-10', availableQuantity: 0 }],
		})

		const page = await useCase.getProductBySlug('racao-esgotada-pagina', store.slug)
		expect(page.inStock).toBe(false)
		expect(Object.keys(page).sort()).toEqual(
			[
				'name',
				'slug',
				'description',
				'brand',
				'primaryCategory',
				'categories',
				'images',
				'variants',
				'primaryCategoryPath',
				'priceRange',
				'inStock',
			].sort(),
		)

		await expect(useCase.getProductBySlug('racao-inativa-pagina', store.slug)).rejects.toThrow()
	})
})
