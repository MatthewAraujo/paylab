import { CsvImportValidationError } from '@/domain/quintalpet/application/use-cases/errors/csv-import-validation-error'
import { ImportCatalogProductsUseCase } from '@/domain/quintalpet/application/use-cases/import-catalog-products'
import type { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogBrandsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-brands-repository'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaCatalogProductsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-products-repository'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'
import type { Prisma } from '@prisma/client'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const brandsRepository = new PrismaCatalogBrandsRepository(prisma)
const categoriesRepository = new PrismaCatalogCategoriesRepository(prisma)
const productsRepository = new PrismaCatalogProductsRepository(prisma)
const inventoryItemsRepository = new PrismaInventoryItemsRepository(prisma)

const useCase = new ImportCatalogProductsUseCase(
	prisma,
	brandsRepository,
	categoriesRepository,
	productsRepository,
	inventoryItemsRepository,
)

// The `compare_at_price` column is a removed legacy field kept here on purpose:
// the importer must ignore the unknown column, not reject the file.
const HEADER =
	'product_slug,product_name,description,brand,primary_category,subcategory,variant_name,sku,price,compare_at_price,cost,barcode,weight,initial_stock'

function csv(lines: string[]): Buffer {
	return Buffer.from(`${[HEADER, ...lines].join('\n')}\n`, 'utf-8')
}

async function resetDatabase() {
	await prisma.auditLog.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
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

async function createStore(slug: string) {
	return prisma.store.create({ data: { name: slug, slug } })
}

async function createCategory(input: {
	storeId: string
	name: string
	slug: string
	parentCategoryId?: string | null
	status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
}) {
	return prisma.category.create({
		data: {
			storeId: input.storeId,
			name: input.name,
			slug: input.slug,
			parentCategoryId: input.parentCategoryId ?? null,
			status: input.status ?? 'ACTIVE',
		},
	})
}

describe('ImportCatalogProductsUseCase', () => {
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

	test('creates products as DRAFT with variants, missing brand/category, and opening stock', async () => {
		const store = await createStore('happy-path')

		const result = await useCase.execute(
			store.id,
			csv([
				'racao-premium,Racao Premium,Super premium,Golden,Caes,Racoes,10kg,,199.90,,,,10kg,25',
				'racao-premium,Racao Premium,,,,,15kg,,289.90,,,,15kg,0',
				'petisco,Petisco Natural,,,Caes,,Unico,,49.90,,,,,5',
			]),
		)

		expect(result).toEqual({
			products: 2,
			variants: 3,
			brandsCreated: 1,
			categoriesCreated: 2,
			inventoryMovements: 2,
		})

		const products = await prisma.product.findMany({
			where: { storeId: store.id },
			include: { variants: true },
			orderBy: { slug: 'asc' },
		})
		expect(products).toHaveLength(2)
		expect(products.every((product) => product.status === 'DRAFT')).toBe(true)

		const racao = products.find((product) => product.slug === 'racao-premium')
		expect(racao?.variants).toHaveLength(2)

		const tenKg = racao?.variants.find((variant) => variant.name === '10kg')
		const item = await prisma.inventoryItem.findFirst({
			where: { storeId: store.id, variantId: tenKg?.id },
			include: { movements: true },
		})
		expect(item?.availableQuantity).toBe(25)
		expect(item?.movements).toHaveLength(1)
		expect(item?.movements[0].type).toBe('INBOUND')

		const brands = await prisma.brand.findMany({ where: { storeId: store.id } })
		expect(brands).toEqual([
			expect.objectContaining({ name: 'Golden', slug: 'golden', status: 'ACTIVE' }),
		])

		const categories = await prisma.category.findMany({ where: { storeId: store.id } })
		expect(categories.map((category) => category.slug).sort()).toEqual(['caes', 'caes-racoes'])
	})

	test('reuses an existing brand and category by slug, creating only what is missing', async () => {
		const store = await createStore('reuse')
		await prisma.brand.create({ data: { storeId: store.id, name: 'Golden', slug: 'golden' } })
		await prisma.category.create({ data: { storeId: store.id, name: 'Caes', slug: 'caes' } })

		const result = await useCase.execute(
			store.id,
			csv(['racao,Racao,,Golden,Caes,Premium,10kg,,10.00,,,,,0']),
		)

		expect(result.brandsCreated).toBe(0)
		expect(result.categoriesCreated).toBe(1)

		const brands = await prisma.brand.findMany({ where: { storeId: store.id } })
		expect(brands).toHaveLength(1)
		const categories = await prisma.category.findMany({ where: { storeId: store.id } })
		expect(categories.map((category) => category.slug).sort()).toEqual(['caes', 'caes-premium'])
	})

	test('reuses existing nested categories by bare name inside the resolved primary branch', async () => {
		const store = await createStore('nested-match')
		const gatos = await createCategory({ storeId: store.id, name: 'Gatos', slug: 'gatos' })
		const caes = await createCategory({ storeId: store.id, name: 'Caes', slug: 'caes' })
		const higiene = await createCategory({
			storeId: store.id,
			name: 'Higiene',
			slug: 'gatos-higiene',
			parentCategoryId: gatos.id,
		})
		const gatosRacao = await createCategory({
			storeId: store.id,
			name: 'Ração',
			slug: 'gatos-racao',
			parentCategoryId: gatos.id,
		})
		await createCategory({
			storeId: store.id,
			name: 'Ração',
			slug: 'caes-racao',
			parentCategoryId: caes.id,
		})

		const result = await useCase.execute(
			store.id,
			csv(['granplus,Gran Plus,,Golden,Gatos,Higiene,1kg,,10.00,,,,,0']),
		)

		expect(result.categoriesCreated).toBe(0)

		const product = await prisma.product.findFirstOrThrow({
			where: { storeId: store.id, slug: 'granplus' },
			include: { categories: true },
		})

		expect(product.primaryCategoryId).toBe(gatos.id)
		expect(product.categories.map((entry) => entry.categoryId).sort()).toEqual(
			[gatos.id, higiene.id].sort(),
		)
	})

	test('resolves a primary_category path to the existing nested child', async () => {
		const store = await createStore('path-primary')
		const gatos = await createCategory({ storeId: store.id, name: 'Gatos', slug: 'gatos' })
		const gatosRacao = await createCategory({
			storeId: store.id,
			name: 'Ração',
			slug: 'gatos-racao',
			parentCategoryId: gatos.id,
		})
		const caes = await createCategory({ storeId: store.id, name: 'Caes', slug: 'caes' })
		await createCategory({
			storeId: store.id,
			name: 'Ração',
			slug: 'caes-racao',
			parentCategoryId: caes.id,
		})

		const result = await useCase.execute(
			store.id,
			csv(['special-cat,Special Cat,,,Gatos > Ração,,1kg,,10.00,,,,,0']),
		)

		expect(result.categoriesCreated).toBe(0)

		const product = await prisma.product.findFirstOrThrow({
			where: { storeId: store.id, slug: 'special-cat' },
		})
		expect(product.primaryCategoryId).toBe(gatosRacao.id)
	})

	test('aborts the import with AMBIGUOUS_CATEGORY when a bare category name exists in multiple branches', async () => {
		const store = await createStore('ambiguous-category')
		const petiscos = await createCategory({ storeId: store.id, name: 'Petiscos', slug: 'petiscos' })
		const gatos = await createCategory({ storeId: store.id, name: 'Gatos', slug: 'gatos' })
		const caes = await createCategory({ storeId: store.id, name: 'Caes', slug: 'caes' })
		await createCategory({
			storeId: store.id,
			name: 'Ração',
			slug: 'gatos-racao',
			parentCategoryId: gatos.id,
		})
		await createCategory({
			storeId: store.id,
			name: 'Ração',
			slug: 'caes-racao',
			parentCategoryId: caes.id,
		})

		await expect(
			useCase.execute(store.id, csv(['ambiguous,Ambiguous,,,Petiscos,Ração,1kg,,10.00,,,,,0'])),
		).rejects.toMatchObject({
			rowErrors: [
				expect.objectContaining({
					line: 2,
					column: 'categories',
					code: 'AMBIGUOUS_CATEGORY',
					message: expect.stringContaining('Use "Departamento > Nome"'),
				}),
			],
		})

		expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(0)
		expect(await prisma.category.count({ where: { storeId: store.id } })).toBe(5)
		expect(petiscos.id).toBeTruthy()
	})

	test('creates a missing primary_category as a new root', async () => {
		const store = await createStore('new-root')

		const result = await useCase.execute(
			store.id,
			csv(['aves-top,Aves Top,,,Aves,,1kg,,10.00,,,,,0']),
		)

		expect(result.categoriesCreated).toBe(1)

		const category = await prisma.category.findFirstOrThrow({
			where: { storeId: store.id, slug: 'aves' },
		})
		expect(category.parentCategoryId).toBeNull()
	})

	test('creates missing intermediate path segments in place', async () => {
		const store = await createStore('missing-middle')
		const agro = await createCategory({ storeId: store.id, name: 'Agro', slug: 'agro' })

		const result = await useCase.execute(
			store.id,
			csv(['nutricao-aves,Nutricao Aves,,,Agro > Nutrição > Aves,,1kg,,10.00,,,,,0']),
		)

		expect(result.categoriesCreated).toBe(2)

		const nutricao = await prisma.category.findFirstOrThrow({
			where: { storeId: store.id, slug: 'agro-nutricao' },
		})
		const aves = await prisma.category.findFirstOrThrow({
			where: { storeId: store.id, slug: 'agro-nutricao-aves' },
		})

		expect(nutricao.parentCategoryId).toBe(agro.id)
		expect(aves.parentCategoryId).toBe(nutricao.id)
	})

	test('aborts the import when a matched category is inactive', async () => {
		const store = await createStore('inactive-category')
		const gatos = await createCategory({ storeId: store.id, name: 'Gatos', slug: 'gatos' })
		await createCategory({
			storeId: store.id,
			name: 'Higiene',
			slug: 'gatos-higiene',
			parentCategoryId: gatos.id,
			status: 'INACTIVE',
		})

		await expect(
			useCase.execute(store.id, csv(['banho,Banho,,,Gatos,Higiene,1kg,,10.00,,,,,0'])),
		).rejects.toMatchObject({
			rowErrors: [
				expect.objectContaining({
					line: 2,
					column: 'categories',
					code: 'INACTIVE_CATEGORY',
				}),
			],
		})

		expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('reuses categories created earlier in the same import for later rows with the same path', async () => {
		const store = await createStore('path-dedupe')

		const result = await useCase.execute(
			store.id,
			csv([
				'cat-one,Cat One,,,Gatos > Ração,,1kg,,10.00,,,,,0',
				'dog-one,Dog One,,,Gatos > Ração,,2kg,,12.00,,,,,0',
			]),
		)

		expect(result.categoriesCreated).toBe(2)

		const categories = await prisma.category.findMany({
			where: { storeId: store.id },
			orderBy: { slug: 'asc' },
		})
		expect(categories.map((category) => category.slug)).toEqual(['gatos', 'gatos-racao'])

		const products = await prisma.product.findMany({
			where: { storeId: store.id },
			orderBy: { slug: 'asc' },
		})
		expect(products).toHaveLength(2)
		expect(new Set(products.map((product) => product.primaryCategoryId)).size).toBe(1)
	})

	test('ignores same-named categories from another store during resolution', async () => {
		const storeA = await createStore('category-store-a')
		const storeB = await createStore('category-store-b')
		const gatosA = await createCategory({ storeId: storeA.id, name: 'Gatos', slug: 'gatos' })
		const gatosB = await createCategory({ storeId: storeB.id, name: 'Gatos', slug: 'gatos' })
		await createCategory({
			storeId: storeB.id,
			name: 'Higiene',
			slug: 'gatos-higiene',
			parentCategoryId: gatosB.id,
		})

		const result = await useCase.execute(
			storeA.id,
			csv(['store-a-product,Store A Product,,,Gatos,Higiene,1kg,,10.00,,,,,0']),
		)

		expect(result.categoriesCreated).toBe(1)

		const created = await prisma.category.findFirstOrThrow({
			where: { storeId: storeA.id, slug: 'gatos-higiene' },
		})
		expect(created.parentCategoryId).toBe(gatosA.id)
	})

	test('generates unique SKUs for rows with a blank sku', async () => {
		const store = await createStore('sku-gen')

		await useCase.execute(
			store.id,
			csv(['racao,Racao,,,Cachorro,,10kg,,10.00,,,,,0', 'racao,Racao,,,,,15kg,,12.00,,,,,0']),
		)

		const variants = await prisma.productVariant.findMany({ where: { storeId: store.id } })
		const skus = variants.map((variant) => variant.sku)
		expect(skus).toHaveLength(2)
		expect(new Set(skus).size).toBe(2)
		expect(skus.every((sku) => sku.length > 0)).toBe(true)
	})

	test('aborts the whole import when a product_slug already exists in the store', async () => {
		const store = await createStore('dup-slug')
		await prisma.product.create({
			data: { storeId: store.id, name: 'Existing', slug: 'existing' },
		})

		await expect(
			useCase.execute(
				store.id,
				csv(['existing,Existing Again,,,,,v,,10.00,,,,,0', 'new-one,New One,,,,,v,,10.00,,,,,0']),
			),
		).rejects.toMatchObject({
			rowErrors: expect.arrayContaining([
				expect.objectContaining({ line: 2, column: 'product_slug', code: 'PRODUCT_SLUG_EXISTS' }),
			]),
		})

		expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(1)
	})

	test('aborts the whole import when a sku already exists in the store', async () => {
		const store = await createStore('dup-sku')
		const existing = await prisma.product.create({
			data: { storeId: store.id, name: 'Existing', slug: 'existing' },
		})
		await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: existing.id,
				name: 'v',
				sku: 'TAKEN-1',
				priceCents: 1000,
			},
		})

		await expect(
			useCase.execute(store.id, csv(['new-one,New One,,,,,v,TAKEN-1,10.00,,,,,0'])),
		).rejects.toBeInstanceOf(CsvImportValidationError)

		expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(1)
		expect(await prisma.productVariant.count({ where: { storeId: store.id } })).toBe(1)
	})

	test('rolls the whole transaction back when a write fails mid-import', async () => {
		const store = await createStore('rollback')

		class FailingProductsRepository extends PrismaCatalogProductsRepository {
			public calls = 0
			async save(product: Product, tx?: Prisma.TransactionClient): Promise<void> {
				this.calls += 1
				if (this.calls === 2) {
					throw new Error('forced write failure')
				}
				return super.save(product, tx)
			}
		}

		const failing = new ImportCatalogProductsUseCase(
			prisma,
			brandsRepository,
			categoriesRepository,
			new FailingProductsRepository(prisma),
			inventoryItemsRepository,
		)

		await expect(
			failing.execute(
				store.id,
				csv(['first,First,,Golden,,,v,,10.00,,,,,3', 'second,Second,,,,,v,,10.00,,,,,0']),
			),
		).rejects.toThrow('forced write failure')

		expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(0)
		expect(await prisma.brand.count({ where: { storeId: store.id } })).toBe(0)
		expect(await prisma.inventoryItem.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('is tenant-scoped: a slug that exists only in another store imports fine', async () => {
		const storeA = await createStore('store-a')
		const storeB = await createStore('store-b')
		await prisma.product.create({
			data: { storeId: storeB.id, name: 'Shared', slug: 'shared' },
		})

		const result = await useCase.execute(storeA.id, csv(['shared,Shared,,,,,v,,10.00,,,,,0']))

		expect(result.products).toBe(1)
		expect(await prisma.product.count({ where: { storeId: storeA.id } })).toBe(1)
		expect(await prisma.product.count({ where: { storeId: storeB.id } })).toBe(1)
	})
})
