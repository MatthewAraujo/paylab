import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CatalogBrandsRepository } from '@/domain/quintalpet/application/repositories/catalog-brands-repository'
import { CatalogCategoriesRepository } from '@/domain/quintalpet/application/repositories/catalog-categories-repository'
import { CatalogProductsRepository } from '@/domain/quintalpet/application/repositories/catalog-products-repository'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { Brand } from '@/domain/quintalpet/enterprise/entities/brand'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { ProductVariant } from '@/domain/quintalpet/enterprise/entities/product-variant'
import {
	normalizeName,
	parseCategoryReference,
} from '@/domain/quintalpet/enterprise/services/csv/category-reference'
import type {
	CsvRowError,
	ProductImportGroup,
} from '@/domain/quintalpet/enterprise/services/csv/parse-product-import-csv'
import { validateProductImport } from '@/domain/quintalpet/enterprise/services/csv/validate-product-import'
import { generateCategorySlug } from '@/domain/quintalpet/enterprise/services/generate-category-slug'
import { generateUniqueCategorySlug } from '@/domain/quintalpet/enterprise/services/generate-unique-category-slug'
import { generateVariantSku } from '@/domain/quintalpet/enterprise/services/generate-variant-sku'
import { CategoryStatus } from '@/domain/quintalpet/enterprise/types/category-status'
import { Money } from '@/domain/quintalpet/enterprise/value-objects/money'
import { Sku } from '@/domain/quintalpet/enterprise/value-objects/sku'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CsvImportValidationError } from './errors/csv-import-validation-error'

export interface ImportCatalogProductsResult {
	products: number
	variants: number
	brandsCreated: number
	categoriesCreated: number
	inventoryMovements: number
}

const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000
const ROOT_CATEGORY_KEY = '__root__'

interface ResolvedGroupCategories {
	primaryCategoryId: string
	primaryCategorySlug: string
	categoryIds: string[]
}

interface IndexedCategory {
	id: string
	name: string
	slug: string
	status: CategoryStatus
	parentCategoryId: string | null
	normalizedName: string
}

interface CategoryIndex {
	byId: Map<string, IndexedCategory>
	byNormalizedName: Map<string, IndexedCategory[]>
	childrenByParent: Map<string, IndexedCategory[]>
	slugSet: Set<string>
}

/**
 * Bulk product onboarding from a CSV (ADR 0008). Parses + validates the upload
 * (T1/T2), then creates missing brands/categories, products (as `DRAFT`),
 * variants, and opening stock (`INBOUND` movement) in a single all-or-nothing
 * transaction. Any invalid row — including a `product_slug` / `sku` / `barcode`
 * that already exists in the store — aborts the whole import with nothing
 * persisted, surfaced as `CsvImportValidationError`.
 */
@Injectable()
export class ImportCatalogProductsUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly brandsRepository: CatalogBrandsRepository,
		private readonly categoriesRepository: CatalogCategoriesRepository,
		private readonly productsRepository: CatalogProductsRepository,
		private readonly inventoryItemsRepository: InventoryItemsRepository,
	) {}

	async execute(storeId: string, fileBuffer: Buffer): Promise<ImportCatalogProductsResult> {
		const validation = validateProductImport(fileBuffer)

		if (validation.fileErrors.length > 0 || validation.rowErrors.length > 0) {
			throw new CsvImportValidationError(validation.rowErrors, validation.fileErrors)
		}

		const groups = validation.groups

		return this.prisma.$transaction(
			async (tx) => {
				const rowErrors: CsvRowError[] = []

				const brandSlugByName = buildBrandSlugMap(groups)

				await this.collectStoreLevelRowErrors(tx, storeId, groups, rowErrors)

				if (rowErrors.length > 0) {
					throw new CsvImportValidationError(rowErrors, [])
				}

				const { assignmentsByProductSlug, categoriesCreated } = await this.resolveCategories(
					tx,
					storeId,
					groups,
					rowErrors,
				)

				if (rowErrors.length > 0) {
					throw new CsvImportValidationError(rowErrors, [])
				}

				const brandIdBySlug = await this.resolveBrands(tx, storeId, brandSlugByName)
				const brandsCreated = await this.createMissingBrands(
					tx,
					storeId,
					brandSlugByName,
					brandIdBySlug,
				)
				const takenSkus = await this.buildTakenSkuSet(tx, storeId, groups)

				let productCount = 0
				let variantCount = 0
				let inventoryMovements = 0

				for (const group of groups) {
					const product = this.buildProduct(
						storeId,
						group,
						brandSlugByName,
						brandIdBySlug,
						assignmentsByProductSlug,
					)
					const variantBarcodes = this.addVariants(
						product,
						group,
						assignmentsByProductSlug,
						takenSkus,
					)

					await this.productsRepository.save(product, tx)
					productCount += 1
					variantCount += product.variants.length

					for (const entry of variantBarcodes) {
						await tx.productVariant.update({
							where: { id: entry.variantId },
							data: { barcode: entry.barcode },
						})
					}

					for (let index = 0; index < group.variants.length; index += 1) {
						const initialStock = group.variants[index].initialStock
						if (initialStock <= 0) continue

						const variant = product.variants[index]
						const item = InventoryItem.create({
							storeId: new UniqueEntityID(storeId),
							variantId: variant.id,
						})
						const movement = item.receive(initialStock, 'Importação CSV')
						await this.inventoryItemsRepository.save(item, movement, tx)
						inventoryMovements += 1
					}
				}

				return {
					products: productCount,
					variants: variantCount,
					brandsCreated,
					categoriesCreated,
					inventoryMovements,
				}
			},
			{ timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
		)
	}

	private async collectStoreLevelRowErrors(
		tx: Prisma.TransactionClient,
		storeId: string,
		groups: ProductImportGroup[],
		rowErrors: CsvRowError[],
	): Promise<void> {
		const slugToFirstLine = new Map(groups.map((group) => [group.productSlug, group.firstLine]))
		const skuToLine = new Map<string, number>()
		const barcodeToLine = new Map<string, number>()
		const seenBarcodes = new Map<string, number>()

		for (const group of groups) {
			for (const variant of group.variants) {
				if (variant.sku) {
					skuToLine.set(Sku.create(variant.sku).value, variant.line)
				}
				if (variant.barcode) {
					if (seenBarcodes.has(variant.barcode)) {
						rowErrors.push({
							line: variant.line,
							column: 'barcode',
							code: 'DUPLICATE_BARCODE_IN_FILE',
							message: `Linha ${variant.line}: o código de barras "${variant.barcode}" já aparece na linha ${seenBarcodes.get(variant.barcode)}.`,
						})
					} else {
						seenBarcodes.set(variant.barcode, variant.line)
						barcodeToLine.set(variant.barcode, variant.line)
					}
				}
			}

			if (group.categories.length > 0 && !group.primaryCategory) {
				rowErrors.push({
					line: group.firstLine,
					column: 'primary_category',
					code: 'MISSING_REQUIRED_FIELD',
					message: `Linha ${group.firstLine}: primary_category é obrigatório quando subcategory é informado.`,
				})
			}
		}

		const existingProducts = await tx.product.findMany({
			where: { storeId, slug: { in: [...slugToFirstLine.keys()] } },
			select: { slug: true },
		})
		for (const product of existingProducts) {
			const line = slugToFirstLine.get(product.slug) ?? 0
			rowErrors.push({
				line,
				column: 'product_slug',
				code: 'PRODUCT_SLUG_EXISTS',
				message: `Linha ${line}: já existe um produto com o slug "${product.slug}" nesta loja.`,
			})
		}

		if (skuToLine.size > 0) {
			const existingVariants = await tx.productVariant.findMany({
				where: { storeId, sku: { in: [...skuToLine.keys()] } },
				select: { sku: true },
			})
			for (const variant of existingVariants) {
				const line = skuToLine.get(variant.sku) ?? 0
				rowErrors.push({
					line,
					column: 'sku',
					code: 'SKU_EXISTS',
					message: `Linha ${line}: o SKU "${variant.sku}" já existe nesta loja.`,
				})
			}
		}

		if (barcodeToLine.size > 0) {
			const existingBarcodes = await tx.productVariant.findMany({
				where: { storeId, barcode: { in: [...barcodeToLine.keys()] } },
				select: { barcode: true },
			})
			for (const variant of existingBarcodes) {
				const line = variant.barcode ? (barcodeToLine.get(variant.barcode) ?? 0) : 0
				rowErrors.push({
					line,
					column: 'barcode',
					code: 'BARCODE_EXISTS',
					message: `Linha ${line}: o código de barras "${variant.barcode}" já existe nesta loja.`,
				})
			}
		}
	}

	private async resolveBrands(
		tx: Prisma.TransactionClient,
		storeId: string,
		brandSlugByName: Map<string, string>,
	): Promise<Map<string, string>> {
		const brandIdBySlug = new Map<string, string>()
		const slugs = [...new Set(brandSlugByName.values())]
		if (slugs.length === 0) return brandIdBySlug

		const existing = await tx.brand.findMany({
			where: { storeId, slug: { in: slugs } },
			select: { id: true, slug: true },
		})
		for (const brand of existing) {
			brandIdBySlug.set(brand.slug, brand.id)
		}
		return brandIdBySlug
	}

	private async createMissingBrands(
		tx: Prisma.TransactionClient,
		storeId: string,
		brandSlugByName: Map<string, string>,
		brandIdBySlug: Map<string, string>,
	): Promise<number> {
		let created = 0
		for (const [name, slug] of brandSlugByName) {
			if (brandIdBySlug.has(slug)) continue

			const brand = Brand.create({
				storeId: new UniqueEntityID(storeId),
				name,
				slug: CatalogSlug.create(slug),
			})
			await this.brandsRepository.save(brand, tx)
			brandIdBySlug.set(slug, brand.id.toString())
			created += 1
		}
		return created
	}

	private async resolveCategories(
		tx: Prisma.TransactionClient,
		storeId: string,
		groups: ProductImportGroup[],
		rowErrors: CsvRowError[],
	): Promise<{
		assignmentsByProductSlug: Map<string, ResolvedGroupCategories>
		categoriesCreated: number
	}> {
		const assignmentsByProductSlug = new Map<string, ResolvedGroupCategories>()
		const index = await this.loadCategoryIndex(tx, storeId)
		let categoriesCreated = 0

		for (const group of groups) {
			if (!group.primaryCategory) continue

			const beforePrimaryCount = index.byId.size
			const primaryCategory = await this.resolvePrimaryCategory(
				tx,
				storeId,
				group,
				index,
				rowErrors,
			)
			if (!primaryCategory) {
				continue
			}

			categoriesCreated += index.byId.size - beforePrimaryCount

			const categoryIds = new Set<string>([primaryCategory.id])

			for (const rawReference of group.categories) {
				const beforeCount = index.byId.size
				const category = await this.resolveCategoryEntry(
					tx,
					storeId,
					group,
					rawReference,
					primaryCategory,
					index,
					rowErrors,
				)
				if (!category) continue
				categoriesCreated += index.byId.size - beforeCount
				categoryIds.add(category.id)
			}

			assignmentsByProductSlug.set(group.productSlug, {
				primaryCategoryId: primaryCategory.id,
				primaryCategorySlug: primaryCategory.slug,
				categoryIds: [...categoryIds],
			})
		}

		return { assignmentsByProductSlug, categoriesCreated }
	}

	private async buildTakenSkuSet(
		tx: Prisma.TransactionClient,
		storeId: string,
		groups: ProductImportGroup[],
	): Promise<Set<string>> {
		const taken = new Set<string>()
		for (const group of groups) {
			for (const variant of group.variants) {
				if (variant.sku) taken.add(Sku.create(variant.sku).value)
			}
		}

		const existing = await tx.productVariant.findMany({
			where: { storeId },
			select: { sku: true },
		})
		for (const variant of existing) taken.add(variant.sku)

		return taken
	}

	private buildProduct(
		storeId: string,
		group: ProductImportGroup,
		brandSlugByName: Map<string, string>,
		brandIdBySlug: Map<string, string>,
		assignmentsByProductSlug: Map<string, ResolvedGroupCategories>,
	): Product {
		const brandSlug = group.brand ? brandSlugByName.get(group.brand) : undefined
		const brandId = brandSlug ? brandIdBySlug.get(brandSlug) : undefined
		const categoryAssignment = assignmentsByProductSlug.get(group.productSlug)

		const product = Product.create({
			storeId: new UniqueEntityID(storeId),
			name: group.productName,
			slug: CatalogSlug.create(group.productSlug),
			description: group.description ?? null,
			brandId: brandId ? new UniqueEntityID(brandId) : null,
		})

		if (categoryAssignment) {
			product.assignCategories({
				primaryCategoryId: new UniqueEntityID(categoryAssignment.primaryCategoryId),
				categories: categoryAssignment.categoryIds.map((id) => ({
					categoryId: new UniqueEntityID(id),
					status: CategoryStatus.ACTIVE,
				})),
			})
		}

		return product
	}

	private addVariants(
		product: Product,
		group: ProductImportGroup,
		assignmentsByProductSlug: Map<string, ResolvedGroupCategories>,
		takenSkus: Set<string>,
	): Array<{ variantId: string; barcode: string }> {
		const primaryCategorySlug = assignmentsByProductSlug.get(group.productSlug)?.primaryCategorySlug
		const barcodes: Array<{ variantId: string; barcode: string }> = []
		let sequence = 1

		for (const row of group.variants) {
			let sku: string
			if (row.sku) {
				sku = Sku.create(row.sku).value
			} else {
				let candidate = generateVariantSku({
					categorySlug: primaryCategorySlug,
					productSlug: group.productSlug,
					sequence,
				})
				while (takenSkus.has(candidate)) {
					sequence += 1
					candidate = generateVariantSku({
						categorySlug: primaryCategorySlug,
						productSlug: group.productSlug,
						sequence,
					})
				}
				sku = candidate
			}

			takenSkus.add(sku)
			sequence += 1

			const variant = ProductVariant.create({
				name: row.variantName,
				sku: Sku.create(sku),
				price: Money.create(row.priceCents),
				cost: row.costCents == null ? null : Money.create(row.costCents),
				attributes: row.attributes,
			})
			product.addVariant(variant)

			if (row.barcode) {
				barcodes.push({ variantId: variant.id.toString(), barcode: row.barcode })
			}
		}

		return barcodes
	}

	private async loadCategoryIndex(
		tx: Prisma.TransactionClient,
		storeId: string,
	): Promise<CategoryIndex> {
		const categories = await tx.category.findMany({
			where: { storeId },
			select: {
				id: true,
				name: true,
				slug: true,
				status: true,
				parentCategoryId: true,
			},
		})

		const index: CategoryIndex = {
			byId: new Map(),
			byNormalizedName: new Map(),
			childrenByParent: new Map(),
			slugSet: new Set(),
		}

		for (const category of categories) {
			this.indexCategory(index, {
				id: category.id,
				name: category.name,
				slug: category.slug,
				status: category.status as CategoryStatus,
				parentCategoryId: category.parentCategoryId,
				normalizedName: normalizeName(category.name),
			})
		}

		return index
	}

	private async resolvePrimaryCategory(
		tx: Prisma.TransactionClient,
		storeId: string,
		group: ProductImportGroup,
		index: CategoryIndex,
		rowErrors: CsvRowError[],
	): Promise<IndexedCategory | null> {
		const reference = group.primaryCategory
		if (!reference) return null

		const segments = parseCategoryReference(reference)
		if (segments.length === 0) return null

		if (segments.length === 1) {
			return this.resolveBarePrimaryCategory(
				tx,
				storeId,
				group,
				reference,
				segments[0],
				index,
				rowErrors,
			)
		}

		return this.resolvePathReference(
			tx,
			storeId,
			group,
			reference,
			'primary_category',
			segments,
			index,
			rowErrors,
		)
	}

	private async resolveCategoryEntry(
		tx: Prisma.TransactionClient,
		storeId: string,
		group: ProductImportGroup,
		reference: string,
		primaryCategory: IndexedCategory,
		index: CategoryIndex,
		rowErrors: CsvRowError[],
	): Promise<IndexedCategory | null> {
		const segments = parseCategoryReference(reference)
		if (segments.length === 0) return null

		if (segments.length === 1) {
			return this.resolveBareCategoryEntry(
				tx,
				storeId,
				group,
				reference,
				segments[0],
				primaryCategory,
				index,
				rowErrors,
			)
		}

		return this.resolvePathReference(
			tx,
			storeId,
			group,
			reference,
			'categories',
			segments,
			index,
			rowErrors,
		)
	}

	private async resolveBarePrimaryCategory(
		tx: Prisma.TransactionClient,
		storeId: string,
		group: ProductImportGroup,
		reference: string,
		segment: string,
		index: CategoryIndex,
		rowErrors: CsvRowError[],
	): Promise<IndexedCategory | null> {
		const matches = index.byNormalizedName.get(normalizeName(segment)) ?? []
		if (matches.length === 1) {
			if (matches[0].status !== CategoryStatus.ACTIVE) {
				rowErrors.push(this.buildInactiveCategoryError(group, 'primary_category', reference))
				return null
			}
			return matches[0]
		}

		if (matches.length > 1) {
			rowErrors.push(
				this.buildAmbiguousCategoryError(group, 'primary_category', reference, matches, index),
			)
			return null
		}

		return this.createIndexedCategory(tx, storeId, segment, null, null, index)
	}

	private async resolveBareCategoryEntry(
		tx: Prisma.TransactionClient,
		storeId: string,
		group: ProductImportGroup,
		reference: string,
		segment: string,
		primaryCategory: IndexedCategory,
		index: CategoryIndex,
		rowErrors: CsvRowError[],
	): Promise<IndexedCategory | null> {
		const primaryChildren = this.findChildrenByNormalizedName(
			index,
			primaryCategory.id,
			normalizeName(segment),
		)

		if (primaryChildren.length === 1) {
			if (primaryChildren[0].status !== CategoryStatus.ACTIVE) {
				rowErrors.push(this.buildInactiveCategoryError(group, 'categories', reference))
				return null
			}
			return primaryChildren[0]
		}

		if (primaryChildren.length > 1) {
			rowErrors.push(
				this.buildAmbiguousCategoryError(group, 'categories', reference, primaryChildren, index),
			)
			return null
		}

		const matches = index.byNormalizedName.get(normalizeName(segment)) ?? []
		if (matches.length === 1) {
			if (matches[0].status !== CategoryStatus.ACTIVE) {
				rowErrors.push(this.buildInactiveCategoryError(group, 'categories', reference))
				return null
			}
			return matches[0]
		}

		if (matches.length > 1) {
			rowErrors.push(
				this.buildAmbiguousCategoryError(group, 'categories', reference, matches, index),
			)
			return null
		}

		return this.createIndexedCategory(
			tx,
			storeId,
			segment,
			primaryCategory.id,
			primaryCategory.slug,
			index,
		)
	}

	private async resolvePathReference(
		tx: Prisma.TransactionClient,
		storeId: string,
		group: ProductImportGroup,
		reference: string,
		column: 'primary_category' | 'categories',
		segments: string[],
		index: CategoryIndex,
		rowErrors: CsvRowError[],
	): Promise<IndexedCategory | null> {
		let currentParentId: string | null = null
		let currentParentSlug: string | null = null
		let currentCategory: IndexedCategory | null = null

		for (const segment of segments) {
			const matches = this.findChildrenByNormalizedName(
				index,
				currentParentId,
				normalizeName(segment),
			)

			if (matches.length > 1) {
				rowErrors.push(this.buildAmbiguousCategoryError(group, column, reference, matches, index))
				return null
			}

			if (matches.length === 1) {
				const match = matches[0]
				if (match.status !== CategoryStatus.ACTIVE) {
					rowErrors.push(this.buildInactiveCategoryError(group, column, reference))
					return null
				}
				currentCategory = match
				currentParentId = match.id
				currentParentSlug = match.slug
				continue
			}

			currentCategory = await this.createIndexedCategory(
				tx,
				storeId,
				segment,
				currentParentId,
				currentParentSlug,
				index,
			)
			currentParentId = currentCategory.id
			currentParentSlug = currentCategory.slug
		}

		return currentCategory
	}

	private async createIndexedCategory(
		tx: Prisma.TransactionClient,
		storeId: string,
		name: string,
		parentCategoryId: string | null,
		parentSlug: string | null,
		index: CategoryIndex,
	): Promise<IndexedCategory> {
		const baseSlug = generateCategorySlug(name, parentSlug)
		const slug = await generateUniqueCategorySlug(baseSlug, async (candidate) =>
			index.slugSet.has(candidate),
		)

		const category = Category.create({
			storeId: new UniqueEntityID(storeId),
			name,
			slug: CatalogSlug.create(slug),
			parentCategoryId: parentCategoryId ? new UniqueEntityID(parentCategoryId) : null,
		})
		await this.categoriesRepository.save(category, tx)

		const indexed: IndexedCategory = {
			id: category.id.toString(),
			name,
			slug,
			status: CategoryStatus.ACTIVE,
			parentCategoryId,
			normalizedName: normalizeName(name),
		}
		this.indexCategory(index, indexed)
		return indexed
	}

	private indexCategory(index: CategoryIndex, category: IndexedCategory): void {
		index.byId.set(category.id, category)
		index.slugSet.add(category.slug)

		const normalizedMatches = index.byNormalizedName.get(category.normalizedName) ?? []
		normalizedMatches.push(category)
		index.byNormalizedName.set(category.normalizedName, normalizedMatches)

		const parentKey = this.parentKey(category.parentCategoryId)
		const children = index.childrenByParent.get(parentKey) ?? []
		children.push(category)
		index.childrenByParent.set(parentKey, children)
	}

	private findChildrenByNormalizedName(
		index: CategoryIndex,
		parentCategoryId: string | null,
		normalizedName: string,
	): IndexedCategory[] {
		return (index.childrenByParent.get(this.parentKey(parentCategoryId)) ?? []).filter(
			(category) => category.normalizedName === normalizedName,
		)
	}

	private buildInactiveCategoryError(
		group: ProductImportGroup,
		column: 'primary_category' | 'categories',
		reference: string,
	): CsvRowError {
		return {
			line: group.firstLine,
			column,
			code: 'INACTIVE_CATEGORY',
			message: `Linha ${group.firstLine}: a categoria "${reference}" existe nesta loja mas está inativa ou arquivada.`,
		}
	}

	private buildAmbiguousCategoryError(
		group: ProductImportGroup,
		column: 'primary_category' | 'categories',
		reference: string,
		matches: IndexedCategory[],
		index: CategoryIndex,
	): CsvRowError {
		const locations = [
			...new Set(matches.map((match) => this.formatCategoryPath(match, index))),
		].sort()
		return {
			line: group.firstLine,
			column,
			code: 'AMBIGUOUS_CATEGORY',
			message: `Linha ${group.firstLine}: a categoria "${reference}" é ambígua nesta loja; existe em ${locations.join(', ')}. Use "Departamento > Nome".`,
		}
	}

	private formatCategoryPath(category: IndexedCategory, index: CategoryIndex): string {
		const segments = [category.name]
		let currentParentId = category.parentCategoryId

		while (currentParentId) {
			const parent = index.byId.get(currentParentId)
			if (!parent) break
			segments.unshift(parent.name)
			currentParentId = parent.parentCategoryId
		}

		return segments.join(' > ')
	}

	private parentKey(parentCategoryId: string | null): string {
		return parentCategoryId ?? ROOT_CATEGORY_KEY
	}
}

function buildBrandSlugMap(groups: ProductImportGroup[]): Map<string, string> {
	const map = new Map<string, string>()
	for (const group of groups) {
		if (group.brand && !map.has(group.brand)) {
			map.set(group.brand, CatalogSlug.createFromText(group.brand).value)
		}
	}
	return map
}
