import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { AttachmentsRepository } from '@/domain/quintalpet/application/repositories/attachments-repository'
import { CatalogBrandsRepository } from '@/domain/quintalpet/application/repositories/catalog-brands-repository'
import { CatalogCategoriesRepository } from '@/domain/quintalpet/application/repositories/catalog-categories-repository'
import { CatalogProductsRepository } from '@/domain/quintalpet/application/repositories/catalog-products-repository'
import { Attachment } from '@/domain/quintalpet/enterprise/entities/attachment'
import { Brand } from '@/domain/quintalpet/enterprise/entities/brand'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { ProductImage } from '@/domain/quintalpet/enterprise/entities/product-image'
import { ProductVariant } from '@/domain/quintalpet/enterprise/entities/product-variant'
import { ArchivedCatalogEntityError } from '@/domain/quintalpet/enterprise/errors/archived-catalog-entity-error'
import { CategoryCycleError } from '@/domain/quintalpet/enterprise/errors/category-cycle-error'
import { InactiveCategoryAssignmentError } from '@/domain/quintalpet/enterprise/errors/inactive-category-assignment-error'
import { InvalidCatalogLifecycleTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-catalog-lifecycle-transition-error'
import { InvalidPrimaryCategoryError } from '@/domain/quintalpet/enterprise/errors/invalid-primary-category-error'
import { InvalidVariantPricingError } from '@/domain/quintalpet/enterprise/errors/invalid-variant-pricing-error'
import { ensureCategoryParentingIsAcyclic } from '@/domain/quintalpet/enterprise/services/ensure-category-parenting-is-acyclic'
import { generateCategorySlug } from '@/domain/quintalpet/enterprise/services/generate-category-slug'
import { generateUniqueCategorySlug } from '@/domain/quintalpet/enterprise/services/generate-unique-category-slug'
import { generateVariantSku } from '@/domain/quintalpet/enterprise/services/generate-variant-sku'
import { ProductStatus } from '@/domain/quintalpet/enterprise/types/product-status'
import { Money } from '@/domain/quintalpet/enterprise/value-objects/money'
import { Sku } from '@/domain/quintalpet/enterprise/value-objects/sku'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { CatalogBrandStatus, CatalogCategoryStatus, CatalogProductStatus } from '@prisma/client'

export class CatalogConflictError extends Error {}
export class CatalogValidationError extends Error {}

export interface PublishedEntry {
	id: string
	status: ProductStatus.ACTIVE
}

export interface SkippedEntry {
	id: string
	name: string | null
	reason: 'not_found' | 'not_draft'
	currentStatus?: ProductStatus
}

export interface PublishProductsResult {
	published: PublishedEntry[]
	skipped: SkippedEntry[]
}

@Injectable()
export class ManageCatalogUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly attachmentsRepository: AttachmentsRepository,
		private readonly brandsRepository: CatalogBrandsRepository,
		private readonly categoriesRepository: CatalogCategoriesRepository,
		private readonly productsRepository: CatalogProductsRepository,
	) {}

	async createBrand(input: {
		storeId: string
		name: string
		slug: string
		logoAttachmentId?: string | null
	}) {
		await this.assertBrandSlugAvailable(input.slug, input.storeId)
		const logoAttachment = await this.resolveOptionalAttachment(
			input.logoAttachmentId,
			input.storeId,
			'Brand logo attachment not found.',
		)

		const brand = Brand.create({
			storeId: new UniqueEntityID(input.storeId),
			name: input.name,
			slug: CatalogSlug.create(input.slug),
			logoAttachmentId: logoAttachment?.id ?? null,
			logoUrl: logoAttachment?.url ?? null,
		})

		await this.brandsRepository.save(brand)

		return brand
	}

	async updateBrand(
		storeId: string,
		brandId: string,
		input: { name?: string; logoAttachmentId?: string | null },
	) {
		const brand = await this.getBrandOrFail(brandId, storeId)
		const logoAttachment =
			input.logoAttachmentId !== undefined
				? await this.resolveOptionalAttachment(
						input.logoAttachmentId,
						storeId,
						'Brand logo attachment not found.',
					)
				: undefined
		brand.updateDetails({
			name: input.name,
			logoAttachmentId: logoAttachment !== undefined ? (logoAttachment?.id ?? null) : undefined,
			logoUrl: logoAttachment !== undefined ? (logoAttachment?.url ?? null) : undefined,
		})
		await this.brandsRepository.save(brand)
		return brand
	}

	async deactivateBrand(storeId: string, brandId: string) {
		const brand = await this.getBrandOrFail(brandId, storeId)
		brand.deactivate()
		await this.brandsRepository.save(brand)
		return brand
	}

	async activateBrand(storeId: string, brandId: string) {
		const brand = await this.getBrandOrFail(brandId, storeId)
		brand.activate()
		await this.brandsRepository.save(brand)
		return brand
	}

	async archiveBrand(storeId: string, brandId: string) {
		const brand = await this.getBrandOrFail(brandId, storeId)
		brand.archive()
		await this.brandsRepository.save(brand)
		return brand
	}

	async listBrands(storeId: string) {
		return this.prisma.brand.findMany({
			where: { storeId: storeId },
			orderBy: { createdAt: 'asc' },
		})
	}

	async createCategory(input: {
		storeId: string
		name: string
		parentCategoryId?: string | null
		imageAttachmentId?: string | null
		isVisibleOnHome?: boolean
	}) {
		const parent = input.parentCategoryId
			? await this.getCategoryOrFail(input.parentCategoryId, input.storeId)
			: null

		// The slug is always derived server-side from the name (and parent slug, for a
		// child) — never accepted from the client — so it stays predictable and never
		// collides across siblings under different parents. See T2.
		const baseSlug = generateCategorySlug(input.name, parent?.slug.value)
		const slug = await generateUniqueCategorySlug(baseSlug, async (candidate) =>
			Boolean(
				await this.categoriesRepository.findBySlug(CatalogSlug.create(candidate), input.storeId),
			),
		)

		const imageAttachment = await this.resolveOptionalAttachment(
			input.imageAttachmentId,
			input.storeId,
			'Category image attachment not found.',
		)

		const category = Category.create({
			storeId: new UniqueEntityID(input.storeId),
			name: input.name,
			slug: CatalogSlug.create(slug),
			parentCategoryId: input.parentCategoryId ? new UniqueEntityID(input.parentCategoryId) : null,
			imageAttachmentId: imageAttachment?.id ?? null,
			imageUrl: imageAttachment?.url ?? null,
			isVisibleOnHome: input.isVisibleOnHome,
		})

		await this.categoriesRepository.save(category)

		return category
	}

	async updateCategory(
		storeId: string,
		categoryId: string,
		input: {
			name?: string
			parentCategoryId?: string | null
			imageAttachmentId?: string | null
			isVisibleOnHome?: boolean
		},
	) {
		const category = await this.getCategoryOrFail(categoryId, storeId)

		if (input.parentCategoryId !== undefined) {
			const ancestorIds = await this.categoriesRepository.listAncestorIds(
				input.parentCategoryId ?? categoryId,
				storeId,
			)

			ensureCategoryParentingIsAcyclic({
				categoryId: category.id,
				parentCategoryId: input.parentCategoryId
					? new UniqueEntityID(input.parentCategoryId)
					: null,
				ancestorCategoryIds: ancestorIds.map((id) => new UniqueEntityID(id)),
			})

			if (input.parentCategoryId) {
				await this.getCategoryOrFail(input.parentCategoryId, storeId)
			}
		}

		const imageAttachment =
			input.imageAttachmentId !== undefined
				? await this.resolveOptionalAttachment(
						input.imageAttachmentId,
						storeId,
						'Category image attachment not found.',
					)
				: undefined

		category.updateDetails({
			name: input.name,
			parentCategoryId:
				input.parentCategoryId !== undefined
					? input.parentCategoryId
						? new UniqueEntityID(input.parentCategoryId)
						: null
					: undefined,
			imageAttachmentId: imageAttachment !== undefined ? (imageAttachment?.id ?? null) : undefined,
			imageUrl: imageAttachment !== undefined ? (imageAttachment?.url ?? null) : undefined,
			isVisibleOnHome: input.isVisibleOnHome,
		})

		await this.categoriesRepository.save(category)
		return category
	}

	async deactivateCategory(storeId: string, categoryId: string) {
		const category = await this.getCategoryOrFail(categoryId, storeId)
		category.deactivate()
		await this.categoriesRepository.save(category)
		return category
	}

	async activateCategory(storeId: string, categoryId: string) {
		const category = await this.getCategoryOrFail(categoryId, storeId)
		category.activate()
		await this.categoriesRepository.save(category)
		return category
	}

	async archiveCategory(storeId: string, categoryId: string) {
		const category = await this.getCategoryOrFail(categoryId, storeId)
		category.archive()
		await this.categoriesRepository.save(category)
		return category
	}

	async listCategories(storeId: string) {
		return this.prisma.category.findMany({
			where: { storeId: storeId },
			orderBy: [{ createdAt: 'asc' }],
		})
	}

	async createProduct(input: {
		storeId: string
		name: string
		slug: string
		description?: string | null
		brandId?: string | null
		primaryCategoryId?: string | null
		categoryIds?: string[]
		images?: Array<{
			attachmentId: string
			altText?: string | null
			isPrimary?: boolean
		}>
	}) {
		await this.assertProductSlugAvailable(input.slug, input.storeId)

		const product = Product.create({
			storeId: new UniqueEntityID(input.storeId),
			name: input.name,
			slug: CatalogSlug.create(input.slug),
			description: input.description,
			brandId: input.brandId ? new UniqueEntityID(input.brandId) : null,
		})

		await this.applyProductRelations(product, input.storeId, {
			brandId: input.brandId,
			primaryCategoryId: input.primaryCategoryId,
			categoryIds: input.categoryIds,
		})

		if (input.images !== undefined) {
			product.replaceImages(
				await this.buildProductImagesFromAttachments(input.images, input.storeId),
			)
		}

		await this.productsRepository.save(product)

		return product
	}

	async updateProduct(
		storeId: string,
		productId: string,
		input: {
			name?: string
			description?: string | null
			brandId?: string | null
			primaryCategoryId?: string | null
			categoryIds?: string[]
			status?: ProductStatus
			images?: Array<{
				attachmentId: string
				altText?: string | null
				isPrimary?: boolean
			}>
		},
	) {
		const product = await this.getProductOrFail(productId, storeId)

		await this.applyProductRelations(product, storeId, {
			brandId: input.brandId,
			primaryCategoryId: input.primaryCategoryId,
			categoryIds: input.categoryIds,
		})

		product.updateDetails({
			name: input.name,
			description: input.description,
			brandId:
				input.brandId !== undefined
					? input.brandId
						? new UniqueEntityID(input.brandId)
						: null
					: undefined,
		})

		if (input.images !== undefined) {
			product.replaceImages(await this.buildProductImagesFromAttachments(input.images, storeId))
		}

		if (input.status !== undefined) {
			this.applyProductStatusTransition(product, input.status)
		}

		await this.productsRepository.save(product)
		return product
	}

	// Status changes always route through the same domain transition methods used by
	// the dedicated publish/deactivate/reactivate/archive endpoints, so this shortcut
	// (accepting `status` directly in the update payload) cannot bypass the lifecycle
	// invariants those methods already enforce (e.g. you cannot archive an ACTIVE
	// product directly, or reactivate a product that isn't INACTIVE).
	private applyProductStatusTransition(product: Product, status: ProductStatus) {
		if (product.status === status) {
			return
		}

		switch (status) {
			case ProductStatus.ACTIVE:
				product.publish()
				return
			case ProductStatus.INACTIVE:
				product.deactivate()
				return
			case ProductStatus.ARCHIVED:
				product.archive()
				return
			case ProductStatus.DRAFT:
				throw new CatalogValidationError('Products cannot be moved back to draft status.')
			default:
				throw new CatalogValidationError('Unsupported product status.')
		}
	}

	async addVariant(
		storeId: string,
		productId: string,
		input: {
			name: string
			sku?: string
			barcode?: string | null
			priceCents: number
			costCents?: number | null
			attributes: Record<string, string>
		},
	) {
		const product = await this.getProductOrFail(productId, storeId)

		let sku: string
		if (input.sku) {
			await this.assertSkuAvailable(input.sku, storeId)
			sku = input.sku
		} else {
			const category = product.primaryCategoryId
				? await this.categoriesRepository.findById(product.primaryCategoryId.toString(), storeId)
				: null
			sku = await this.generateUniqueVariantSku(product, category, storeId)
		}

		product.addVariant(
			ProductVariant.create({
				name: input.name,
				sku: Sku.create(sku),
				barcode: input.barcode ?? null,
				price: Money.create(input.priceCents),
				cost: input.costCents == null ? null : Money.create(input.costCents),
				attributes: input.attributes,
			}),
		)

		await this.productsRepository.save(product)

		const createdVariant = product.variants.at(-1)

		if (!createdVariant) {
			throw new CatalogValidationError('Variant could not be created.')
		}

		return createdVariant
	}

	// Same collision-retry idea as `generateUniqueCategorySlug` (T2): the format is
	// deterministic, so on collision (e.g. a manual SKU that happens to match a later
	// generated one) we just advance the sequence and re-check, rather than letting the
	// (storeId, sku) unique-constraint violation bubble up unhandled.
	private async generateUniqueVariantSku(
		product: Product,
		category: Category | null,
		storeId: string,
	): Promise<string> {
		let sequence = product.variants.length + 1
		let candidate = generateVariantSku({
			categorySlug: category?.slug.value,
			productSlug: product.slug.value,
			sequence,
		})

		while (await this.productsRepository.skuExists(Sku.create(candidate), storeId)) {
			sequence += 1
			candidate = generateVariantSku({
				categorySlug: category?.slug.value,
				productSlug: product.slug.value,
				sequence,
			})
		}

		return candidate
	}

	async updateVariant(
		storeId: string,
		productId: string,
		variantId: string,
		input: {
			name?: string
			sku?: string
			barcode?: string | null
			priceCents?: number
			costCents?: number | null
			attributes?: Record<string, string>
		},
	) {
		const product = await this.getProductOrFail(productId, storeId)
		const variant = product.variants.find((item) => item.id.toString() === variantId)

		if (!variant) {
			throw new NotFoundException('Variant not found.')
		}

		if (input.sku) {
			const duplicate = await this.prisma.productVariant.findFirst({
				where: {
					storeId: storeId,
					sku: input.sku,
					id: { not: variantId },
				},
				select: { id: true },
			})

			if (duplicate) {
				throw new CatalogConflictError('Variant SKU already exists in this store.')
			}
		}

		product.updateVariant(new UniqueEntityID(variantId), {
			name: input.name,
			sku: input.sku ? Sku.create(input.sku) : undefined,
			barcode: input.barcode,
			price: input.priceCents == null ? undefined : Money.create(input.priceCents),
			cost:
				input.costCents === undefined
					? undefined
					: input.costCents == null
						? null
						: Money.create(input.costCents),
			attributes: input.attributes,
		})

		await this.productsRepository.save(product)

		const updatedVariant = product.variants.find((item) => item.id.toString() === variantId)

		if (!updatedVariant) {
			throw new NotFoundException('Variant not found.')
		}

		return updatedVariant
	}

	async deactivateVariant(storeId: string, productId: string, variantId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		const variant = product.variants.find((item) => item.id.toString() === variantId)

		if (!variant) {
			throw new NotFoundException('Variant not found.')
		}

		product.deactivateVariant(new UniqueEntityID(variantId))
		await this.productsRepository.save(product)
		const deactivatedVariant = product.variants.find((item) => item.id.toString() === variantId)

		if (!deactivatedVariant) {
			throw new NotFoundException('Variant not found.')
		}

		return deactivatedVariant
	}

	async attachProductImages(
		storeId: string,
		productId: string,
		input: {
			images: Array<{
				attachmentId: string
				altText?: string | null
				isPrimary?: boolean
			}>
		},
	) {
		const product = await this.getProductOrFail(productId, storeId)
		const attachments = await Promise.all(
			input.images.map((image) =>
				this.getAttachmentOrFail(
					image.attachmentId,
					storeId,
					'Product image attachment not found.',
				),
			),
		)

		const nextImages = [
			...product.images,
			...input.images.map((image, index) =>
				ProductImage.create({
					attachmentId: attachments[index].id,
					url: attachments[index].url,
					altText: image.altText,
					position: 0,
					isPrimary: image.isPrimary ?? false,
				}),
			),
		]

		product.replaceImages(this.normalizeImages(nextImages))
		await this.productsRepository.save(product)
		return product
	}

	async reorderProductImages(
		storeId: string,
		productId: string,
		input: {
			imageIds: string[]
			primaryImageId?: string | null
		},
	) {
		const product = await this.getProductOrFail(productId, storeId)
		const imageMap = new Map(product.images.map((image) => [image.id.toString(), image]))

		if (input.imageIds.length !== product.images.length) {
			throw new CatalogValidationError(
				'Image ordering must include every product image exactly once.',
			)
		}

		const reorderedImages = input.imageIds.map((imageId) => {
			const image = imageMap.get(imageId)

			if (!image) {
				throw new CatalogValidationError('Image ordering must reference only product images.')
			}

			return image
		})

		product.replaceImages(this.normalizeImages(reorderedImages, input.primaryImageId))
		await this.productsRepository.save(product)
		return product
	}

	async removeProductImage(storeId: string, productId: string, imageId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		const remainingImages = product.images.filter((image) => image.id.toString() !== imageId)

		if (remainingImages.length === product.images.length) {
			throw new NotFoundException('Product image not found.')
		}

		if (remainingImages.length > 0) {
			product.replaceImages(this.normalizeImages(remainingImages))
		} else {
			product.replaceImages([])
		}

		await this.productsRepository.save(product)
		return product
	}

	async publishProduct(storeId: string, productId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		product.publish()
		await this.productsRepository.save(product)
		return product
	}

	// Best-effort bulk publish (see ADR 0009): every eligible DRAFT product is
	// promoted to ACTIVE and the ineligible ids are reported under `skipped`,
	// never aborting the batch. Eligibility is strict DRAFT-only — an INACTIVE
	// product is skipped as `not_draft` even though `product.publish()` would
	// otherwise accept the INACTIVE -> ACTIVE transition, because reactivation
	// stays a deliberate per-product decision. `not_found` conflates "no such
	// product" and "exists only in another store" so there is no cross-tenant
	// existence oracle.
	async publishProducts(storeId: string, productIds: string[]): Promise<PublishProductsResult> {
		const uniqueIds = [...new Set(productIds)]

		const loaded = await Promise.all(
			uniqueIds.map((id) => this.productsRepository.findById(id, storeId)),
		)
		const productsById = new Map<string, Product>()
		loaded.forEach((product, index) => {
			if (product) {
				productsById.set(uniqueIds[index], product)
			}
		})

		const published: PublishedEntry[] = []
		const skipped: SkippedEntry[] = []
		const toPersist: Product[] = []

		for (const id of uniqueIds) {
			const product = productsById.get(id)

			if (!product) {
				skipped.push({ id, name: null, reason: 'not_found' })
				continue
			}

			if (product.status !== ProductStatus.DRAFT) {
				skipped.push({
					id,
					name: product.name,
					reason: 'not_draft',
					currentStatus: product.status,
				})
				continue
			}

			product.publish()
			toPersist.push(product)
			published.push({ id, status: ProductStatus.ACTIVE })
		}

		// Persist the eligible set as one unit so the reported `published` list
		// always matches what committed. `save(product, tx)` is the overload the
		// repo already exposes for a caller-owned transaction.
		if (toPersist.length > 0) {
			await this.prisma.$transaction(async (tx) => {
				for (const product of toPersist) {
					await this.productsRepository.save(product, tx)
				}
			})
		}

		return { published, skipped }
	}

	async deactivateProduct(storeId: string, productId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		product.deactivate()
		await this.productsRepository.save(product)
		return product
	}

	async reactivateProduct(storeId: string, productId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		product.reactivate()
		await this.productsRepository.save(product)
		return product
	}

	async archiveProduct(storeId: string, productId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		product.archive()
		await this.productsRepository.save(product)
		return product
	}

	async restoreProduct(storeId: string, productId: string) {
		const product = await this.getProductOrFail(productId, storeId)
		product.restore()
		await this.productsRepository.save(product)
		return product
	}

	async getProduct(storeId: string, productId: string) {
		return this.getProductOrFail(productId, storeId)
	}

	async listProducts(storeId: string) {
		return this.prisma.product.findMany({
			where: { storeId: storeId },
			orderBy: { createdAt: 'asc' },
			include: {
				categories: true,
				variants: {
					orderBy: { createdAt: 'asc' },
				},
				images: {
					orderBy: { position: 'asc' },
				},
			},
		})
	}

	private async applyProductRelations(
		product: Product,
		storeId: string,
		input: {
			brandId?: string | null
			primaryCategoryId?: string | null
			categoryIds?: string[]
		},
	) {
		if (input.brandId !== undefined && input.brandId !== null) {
			const brand = await this.brandsRepository.findById(input.brandId, storeId)

			if (!brand) {
				throw new CatalogValidationError('Brand does not belong to the current store.')
			}
		}

		if (input.categoryIds === undefined && input.primaryCategoryId === undefined) {
			return
		}

		const categoryIds = new Set(
			input.categoryIds ?? product.categoryIds.map((item) => item.toString()),
		)
		const primaryCategoryId =
			input.primaryCategoryId !== undefined
				? input.primaryCategoryId
				: product.primaryCategoryId?.toString()

		// When the caller sends only `primaryCategoryId` (no explicit `categoryIds`) —
		// the admin client's single-category field — treat it as replacing the
		// product's whole category set with that one category. Without this, the set
		// built above falls back to the product's *current* categoryIds, which is
		// empty on create (nothing assigned yet) or may not even contain the new
		// primary category on update; either way `categoryIds.size === 0` below would
		// skip the assignment entirely and silently drop the change. An explicit
		// `categoryIds` list (even alongside `primaryCategoryId`) is left untouched so
		// the domain's own primaryCategoryId-must-be-a-member check still applies to it.
		if (input.categoryIds === undefined && primaryCategoryId) {
			categoryIds.clear()
			categoryIds.add(primaryCategoryId)
		}

		if (categoryIds.size === 0) {
			return
		}

		if (!primaryCategoryId) {
			throw new CatalogValidationError('A primary category is required when categories are set.')
		}

		const categories = await Promise.all(
			Array.from(categoryIds).map(async (categoryId) => {
				const category = await this.categoriesRepository.findById(categoryId, storeId)

				if (!category) {
					throw new CatalogValidationError('Product categories must belong to the current store.')
				}

				return {
					categoryId: category.id,
					status: category.status,
				}
			}),
		)

		product.assignCategories({
			primaryCategoryId: new UniqueEntityID(primaryCategoryId),
			categories,
		})
	}

	private async assertBrandSlugAvailable(slug: string, storeId: string) {
		const existing = await this.brandsRepository.findBySlug(CatalogSlug.create(slug), storeId)

		if (existing) {
			throw new CatalogConflictError('Brand slug already exists in this store.')
		}
	}

	private async assertProductSlugAvailable(slug: string, storeId: string) {
		const existing = await this.productsRepository.findBySlug(CatalogSlug.create(slug), storeId)

		if (existing) {
			throw new CatalogConflictError('Product slug already exists in this store.')
		}
	}

	private async assertSkuAvailable(sku: string, storeId: string) {
		const exists = await this.productsRepository.skuExists(Sku.create(sku), storeId)

		if (exists) {
			throw new CatalogConflictError('Variant SKU already exists in this store.')
		}
	}

	private async getBrandOrFail(brandId: string, storeId: string) {
		const brand = await this.brandsRepository.findById(brandId, storeId)

		if (!brand) {
			throw new NotFoundException('Brand not found.')
		}

		return brand
	}

	private async getCategoryOrFail(categoryId: string, storeId: string) {
		const category = await this.categoriesRepository.findById(categoryId, storeId)

		if (!category) {
			throw new NotFoundException('Category not found.')
		}

		return category
	}

	private async getProductOrFail(productId: string, storeId: string) {
		const product = await this.productsRepository.findById(productId, storeId)

		if (!product) {
			throw new NotFoundException('Product not found.')
		}

		return product
	}

	private async getAttachmentOrFail(id: string, storeId: string, message: string) {
		const attachment = await this.attachmentsRepository.findById(id, storeId)

		if (!attachment) {
			throw new NotFoundException(message)
		}

		return attachment
	}

	private async resolveOptionalAttachment(
		id: string | null | undefined,
		storeId: string,
		message: string,
	): Promise<Attachment | null | undefined> {
		if (id === undefined) {
			return undefined
		}

		if (id === null) {
			return null
		}

		return this.getAttachmentOrFail(id, storeId, message)
	}

	private async buildProductImagesFromAttachments(
		images: Array<{
			attachmentId: string
			altText?: string | null
			isPrimary?: boolean
		}>,
		storeId: string,
	) {
		if (images.length === 0) {
			return []
		}

		const attachments = await Promise.all(
			images.map((image) =>
				this.getAttachmentOrFail(
					image.attachmentId,
					storeId,
					'Product image attachment not found.',
				),
			),
		)

		return this.normalizeImages(
			images.map((image, index) =>
				ProductImage.create({
					attachmentId: attachments[index].id,
					url: attachments[index].url,
					altText: image.altText,
					position: index,
					isPrimary: image.isPrimary ?? false,
				}),
			),
		)
	}

	private normalizeImages(images: ProductImage[], primaryImageId?: string | null) {
		if (images.length === 0) {
			return []
		}

		const resolvedPrimaryImageId =
			primaryImageId ??
			images.find((image) => image.isPrimary)?.id.toString() ??
			images[0].id.toString()

		const normalizedImages = images.map((image, index) => {
			const normalizedImage = ProductImage.create(
				{
					attachmentId: image.attachmentId,
					url: image.url,
					altText: image.altText,
					position: index,
					isPrimary: image.id.toString() === resolvedPrimaryImageId,
					createdAt: image.createdAt ?? undefined,
					updatedAt: image.updatedAt ?? undefined,
				},
				image.id,
			)

			return normalizedImage
		})

		if (!normalizedImages.some((image) => image.isPrimary)) {
			throw new CatalogValidationError('Product images must define one primary image.')
		}

		return normalizedImages
	}
}

export function isCatalogDomainError(error: unknown) {
	return (
		error instanceof CatalogConflictError ||
		error instanceof CatalogValidationError ||
		error instanceof ArchivedCatalogEntityError ||
		error instanceof CategoryCycleError ||
		error instanceof InactiveCategoryAssignmentError ||
		error instanceof InvalidPrimaryCategoryError ||
		error instanceof InvalidCatalogLifecycleTransitionError ||
		error instanceof InvalidVariantPricingError
	)
}

export function toCatalogStatus(
	status: CatalogBrandStatus | CatalogCategoryStatus | CatalogProductStatus,
) {
	return status
}
