import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Brand } from '@/domain/quintalpet/enterprise/entities/brand'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { ProductImage } from '@/domain/quintalpet/enterprise/entities/product-image'
import { ProductVariant } from '@/domain/quintalpet/enterprise/entities/product-variant'
import { CategoryStatus } from '@/domain/quintalpet/enterprise/types/category-status'
import { Money } from '@/domain/quintalpet/enterprise/value-objects/money'
import { Sku } from '@/domain/quintalpet/enterprise/value-objects/sku'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogBrandsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-brands-repository'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaCatalogProductsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-products-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const brandsRepository = new PrismaCatalogBrandsRepository(prisma)
const categoriesRepository = new PrismaCatalogCategoriesRepository(prisma)
const productsRepository = new PrismaCatalogProductsRepository(prisma)

async function resetDatabase() {
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

describe('Prisma catalog repositories', () => {
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

	test('saves and loads a brand by id and slug within one store', async () => {
		const store = await prisma.store.create({
			data: { name: 'Brand Store', slug: 'brand-store' },
		})

		const brand = Brand.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Premier',
				slug: CatalogSlug.create('premier'),
				logoUrl: 'https://cdn.example.com/brands/premier.png',
			},
			new UniqueEntityID('brand-1'),
		)

		await brandsRepository.save(brand)

		const byId = await brandsRepository.findById('brand-1', store.id)
		const bySlug = await brandsRepository.findBySlug(CatalogSlug.create('premier'), store.id)

		expect(byId?.id.toString()).toBe('brand-1')
		expect(byId?.logoUrl).toBe('https://cdn.example.com/brands/premier.png')
		expect(bySlug?.id.toString()).toBe('brand-1')
	})

	test('saves and loads a category tree and lists ancestor ids for cycle checks', async () => {
		const store = await prisma.store.create({
			data: { name: 'Category Store', slug: 'category-store' },
		})

		const root = Category.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Caes',
				slug: CatalogSlug.create('caes'),
			},
			new UniqueEntityID('category-root'),
		)
		const child = Category.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Racoes',
				slug: CatalogSlug.create('racoes'),
				parentCategoryId: root.id,
			},
			new UniqueEntityID('category-child'),
		)
		const leaf = Category.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Premium',
				slug: CatalogSlug.create('premium'),
				parentCategoryId: child.id,
				status: CategoryStatus.INACTIVE,
			},
			new UniqueEntityID('category-leaf'),
		)

		await categoriesRepository.save(root)
		await categoriesRepository.save(child)
		await categoriesRepository.save(leaf)

		const loadedLeaf = await categoriesRepository.findBySlug(
			CatalogSlug.create('premium'),
			store.id,
		)
		const ancestors = await categoriesRepository.listAncestorIds(leaf.id.toString(), store.id)

		expect(loadedLeaf?.parentCategoryId?.toString()).toBe(child.id.toString())
		expect(loadedLeaf?.status).toBe(CategoryStatus.INACTIVE)
		expect(ancestors).toEqual([child.id.toString(), root.id.toString()])
	})

	test('saves and loads a product aggregate with variants, categories, and images', async () => {
		const store = await prisma.store.create({
			data: { name: 'Product Store', slug: 'product-store' },
		})

		const brand = Brand.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Premier',
				slug: CatalogSlug.create('premier'),
			},
			new UniqueEntityID('brand-product'),
		)
		const primaryCategory = Category.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Caes',
				slug: CatalogSlug.create('caes'),
			},
			new UniqueEntityID('category-primary'),
		)
		const secondaryCategory = Category.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Adulto',
				slug: CatalogSlug.create('adulto'),
			},
			new UniqueEntityID('category-secondary'),
		)

		await brandsRepository.save(brand)
		await categoriesRepository.save(primaryCategory)
		await categoriesRepository.save(secondaryCategory)
		await prisma.attachment.create({
			data: {
				id: 'attachment-1',
				storeId: store.id,
				title: 'racao-1.png',
				url: 'https://cdn.example.com/products/racao-1.png',
			},
		})

		const product = Product.create(
			{
				storeId: new UniqueEntityID(store.id),
				name: 'Racao Premium Caes Adultos',
				slug: CatalogSlug.create('racao-premium-caes-adultos'),
				description: 'Produto editorial do catalogo',
				brandId: brand.id,
				variants: [
					ProductVariant.create(
						{
							name: '15kg',
							sku: Sku.create('PREMIER-15KG'),
							price: Money.create(24990),
							cost: Money.create(18990),
							attributes: { weight: '15kg', lifeStage: 'adulto' },
						},
						new UniqueEntityID('variant-1'),
					),
				],
				images: [
					ProductImage.create(
						{
							attachmentId: new UniqueEntityID('attachment-1'),
							url: 'https://cdn.example.com/products/racao-1.png',
							altText: 'Racao pacote frontal',
							position: 0,
							isPrimary: true,
						},
						new UniqueEntityID('image-1'),
					),
				],
			},
			new UniqueEntityID('product-1'),
		)

		product.assignCategories({
			primaryCategoryId: primaryCategory.id,
			categories: [
				{ categoryId: primaryCategory.id, status: primaryCategory.status },
				{ categoryId: secondaryCategory.id, status: secondaryCategory.status },
			],
		})

		await productsRepository.save(product)

		const loaded = await productsRepository.findById('product-1', store.id)

		expect(loaded?.name).toBe('Racao Premium Caes Adultos')
		expect(loaded?.brandId?.toString()).toBe(brand.id.toString())
		expect(loaded?.primaryCategoryId?.toString()).toBe(primaryCategory.id.toString())
		expect(loaded?.categoryIds.map((id) => id.toString()).sort()).toEqual(
			[primaryCategory.id.toString(), secondaryCategory.id.toString()].sort(),
		)
		expect(loaded?.variants).toHaveLength(1)
		expect(loaded?.variants[0]?.sku.value).toBe('PREMIER-15KG')
		expect(loaded?.images).toHaveLength(1)
		expect(loaded?.images[0]?.url).toBe('https://cdn.example.com/products/racao-1.png')
	})

	test('saving an existing product preserves the inventory row for an unchanged variant id', async () => {
		const store = await prisma.store.create({
			data: { name: 'Inventory Preserve Store', slug: 'inventory-preserve-store' },
		})

		await prisma.product.create({
			data: {
				id: 'product-preserve',
				storeId: store.id,
				name: 'Racao Preserve',
				slug: 'racao-preserve',
				status: 'ACTIVE',
				variants: {
					create: [
						{
							id: 'variant-preserve',
							storeId: store.id,
							name: '15kg',
							sku: 'PRESERVE-15KG',
							status: 'ACTIVE',
							priceCents: 24990,
							inventoryItem: {
								create: {
									storeId: store.id,
									availableQuantity: 11,
								},
							},
						},
					],
				},
			},
		})

		const loaded = await productsRepository.findById('product-preserve', store.id)

		expect(loaded).not.toBeNull()
		if (!loaded) {
			throw new Error('Expected product-preserve to load')
		}

		loaded.updateDetails({
			description: 'Descricao atualizada sem alterar a variante',
		})

		await productsRepository.save(loaded)

		const inventoryItem = await prisma.inventoryItem.findUnique({
			where: { variantId: 'variant-preserve' },
		})

		expect(inventoryItem?.availableQuantity).toBe(11)
	})

	test('product slug queries and sku existence are store-scoped', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({
				data: { name: 'Isolation A', slug: 'isolation-a' },
			}),
			prisma.store.create({
				data: { name: 'Isolation B', slug: 'isolation-b' },
			}),
		])

		const [brandA, brandB, categoryA, categoryB] = await Promise.all([
			prisma.brand.create({
				data: { storeId: storeA.id, name: 'Marca A', slug: 'marca-a' },
			}),
			prisma.brand.create({
				data: { storeId: storeB.id, name: 'Marca B', slug: 'marca-b' },
			}),
			prisma.category.create({
				data: { storeId: storeA.id, name: 'Caes', slug: 'caes-a' },
			}),
			prisma.category.create({
				data: { storeId: storeB.id, name: 'Caes', slug: 'caes-b' },
			}),
		])

		await prisma.product.createMany({
			data: [
				{
					id: 'product-a',
					storeId: storeA.id,
					brandId: brandA.id,
					primaryCategoryId: categoryA.id,
					name: 'Produto A',
					slug: 'produto-shared',
					status: 'DRAFT',
				},
				{
					id: 'product-b',
					storeId: storeB.id,
					brandId: brandB.id,
					primaryCategoryId: categoryB.id,
					name: 'Produto B',
					slug: 'produto-shared',
					status: 'DRAFT',
				},
			],
		})

		await prisma.productVariant.createMany({
			data: [
				{
					id: 'variant-a',
					storeId: storeA.id,
					productId: 'product-a',
					name: '15kg',
					sku: 'SHARED-SKU',
					priceCents: 1000,
				},
				{
					id: 'variant-b',
					storeId: storeB.id,
					productId: 'product-b',
					name: '15kg',
					sku: 'SHARED-SKU',
					priceCents: 1000,
				},
			],
		})

		const productA = await productsRepository.findBySlug(
			CatalogSlug.create('produto-shared'),
			storeA.id,
		)
		const productB = await productsRepository.findBySlug(
			CatalogSlug.create('produto-shared'),
			storeB.id,
		)
		const hasSkuA = await productsRepository.skuExists(Sku.create('SHARED-SKU'), storeA.id)
		const hasSkuB = await productsRepository.skuExists(Sku.create('SHARED-SKU'), storeB.id)
		const missingOnForeignStore = await productsRepository.findById('product-a', storeB.id)

		expect(productA?.id.toString()).toBe('product-a')
		expect(productB?.id.toString()).toBe('product-b')
		expect(hasSkuA).toBe(true)
		expect(hasSkuB).toBe(true)
		expect(missingOnForeignStore).toBeNull()
	})
})
