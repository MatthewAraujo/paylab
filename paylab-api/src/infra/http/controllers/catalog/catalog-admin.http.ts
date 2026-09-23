import { Brand } from '@/domain/quintalpet/enterprise/entities/brand'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { ProductVariant } from '@/domain/quintalpet/enterprise/entities/product-variant'
import { ProductStatus } from '@/domain/quintalpet/enterprise/types/product-status'
import { z } from 'zod'

export const createBrandBodySchema = z.object({
	name: z.string().min(1),
	slug: z.string().min(1),
	logoAttachmentId: z.string().uuid().optional().nullable(),
})

export const updateBrandBodySchema = z.object({
	name: z.string().min(1).optional(),
	logoAttachmentId: z.string().uuid().optional().nullable(),
})

export const createCategoryBodySchema = z.object({
	name: z.string().min(1),
	parentCategoryId: z.string().uuid().optional().nullable(),
	imageAttachmentId: z.string().uuid().optional().nullable(),
	isVisibleOnHome: z.boolean().optional(),
})

export const updateCategoryBodySchema = z.object({
	name: z.string().min(1).optional(),
	parentCategoryId: z.string().uuid().optional().nullable(),
	imageAttachmentId: z.string().uuid().optional().nullable(),
	isVisibleOnHome: z.boolean().optional(),
})

export const productImageInputSchema = z.object({
	attachmentId: z.string().uuid(),
	altText: z.string().optional().nullable(),
	isPrimary: z.boolean().optional(),
})

export const createProductBodySchema = z.object({
	name: z.string().min(1),
	slug: z.string().min(1),
	description: z.string().optional().nullable(),
	brandId: z.string().uuid().optional().nullable(),
	primaryCategoryId: z.string().uuid().optional().nullable(),
	categoryIds: z.array(z.string().uuid()).optional(),
	images: z.array(productImageInputSchema).optional(),
})

export const updateProductBodySchema = z
	.object({
		name: z.string().min(1).optional(),
		description: z.string().optional().nullable(),
		brandId: z.string().uuid().optional().nullable(),
		primaryCategoryId: z.string().uuid().optional().nullable(),
		categoryIds: z.array(z.string().uuid()).optional(),
		status: z.nativeEnum(ProductStatus).optional(),
		images: z.array(productImageInputSchema).optional(),
		// The admin form still submits `variants` on product update, but variant
		// mutations go through the dedicated `POST/PATCH .../variants[/:variantId]`
		// endpoints (which run their own SKU-uniqueness and pricing checks). Accepted
		// here and ignored, rather than rejected, so the admin client's existing
		// request body doesn't 400 while it still sends this field.
		variants: z.array(z.unknown()).optional(),
	})
	.transform(({ variants: _variants, ...rest }) => rest)

export const createVariantBodySchema = z.object({
	name: z.string().min(1),
	// Optional: the backend generates a standardized SKU from the product's category
	// and slug when omitted (see ManageCatalogUseCase.generateUniqueVariantSku / T4).
	// An operator-supplied value is still honored when present.
	sku: z.string().min(1).optional(),
	barcode: z.string().min(1).optional().nullable(),
	priceCents: z.number().int(),
	costCents: z.number().int().optional().nullable(),
	attributes: z.record(z.string(), z.string()),
})

export const updateVariantBodySchema = z.object({
	name: z.string().min(1).optional(),
	sku: z.string().min(1).optional(),
	barcode: z.string().min(1).optional().nullable(),
	priceCents: z.number().int().optional(),
	costCents: z.number().int().optional().nullable(),
	attributes: z.record(z.string(), z.string()).optional(),
})

export const attachProductImagesBodySchema = z.object({
	images: z.array(productImageInputSchema).min(1),
})

// Bulk publish (see ADR 0009 / PRD-BULK-DRAFT-PUBLISH). `.min(1)` rejects an
// empty selection, `.max(200)` caps the batch (a 201st id is a 400 — the cap
// runs before `.transform`, so 201 distinct ids still fail), and `.transform`
// de-duplicates before the use case sees the list.
export const publishProductsBodySchema = z.object({
	productIds: z
		.array(z.string().uuid())
		.min(1)
		.max(200)
		.transform((ids) => [...new Set(ids)]),
})

export const reorderProductImagesBodySchema = z.object({
	imageIds: z.array(z.string().uuid()).min(1),
	primaryImageId: z.string().uuid().optional().nullable(),
})

export type CreateBrandBody = z.infer<typeof createBrandBodySchema>
export type UpdateBrandBody = z.infer<typeof updateBrandBodySchema>
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>
export type CreateProductBody = z.infer<typeof createProductBodySchema>
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>
export type CreateVariantBody = z.infer<typeof createVariantBodySchema>
export type UpdateVariantBody = z.infer<typeof updateVariantBodySchema>
export type AttachProductImagesBody = z.infer<typeof attachProductImagesBodySchema>
export type PublishProductsBody = z.infer<typeof publishProductsBodySchema>
export type ReorderProductImagesBody = z.infer<typeof reorderProductImagesBodySchema>

export function presentBrand(brand: Brand | { [key: string]: any }) {
	return {
		id: String(brand.id),
		name: brand.name,
		slug: brand.slug?.value ?? brand.slug,
		status: brand.status,
		logoAttachmentId: brand.logoAttachmentId?.toString?.() ?? brand.logoAttachmentId ?? null,
		logoUrl: brand.logoUrl ?? null,
		createdAt: brand.createdAt.toISOString(),
		updatedAt: brand.updatedAt ? brand.updatedAt.toISOString() : null,
		archivedAt: brand.archivedAt ? brand.archivedAt.toISOString() : null,
	}
}

export function presentCategory(category: Category | { [key: string]: any }) {
	return {
		id: String(category.id),
		name: category.name,
		slug: category.slug?.value ?? category.slug,
		status: category.status,
		parentCategoryId: category.parentCategoryId?.toString?.() ?? category.parentCategoryId ?? null,
		imageAttachmentId:
			category.imageAttachmentId?.toString?.() ?? category.imageAttachmentId ?? null,
		imageUrl: category.imageUrl ?? null,
		isVisibleOnHome: category.isVisibleOnHome,
		createdAt: category.createdAt.toISOString(),
		updatedAt: category.updatedAt ? category.updatedAt.toISOString() : null,
		archivedAt: category.archivedAt ? category.archivedAt.toISOString() : null,
	}
}

export function presentVariant(variant: ProductVariant | { [key: string]: any }) {
	const raw = variant as any

	return {
		id: String(raw.id),
		name: raw.name,
		sku: raw.sku?.value ?? raw.sku,
		barcode: raw.barcode ?? null,
		status: raw.status,
		priceCents: raw.price?.amountInCents ?? raw.priceCents,
		costCents: raw.cost?.amountInCents ?? raw.costCents ?? null,
		attributes: raw.attributes,
		deactivatedAt: raw.deactivatedAt ? raw.deactivatedAt.toISOString() : null,
		archivedAt: raw.archivedAt ? raw.archivedAt.toISOString() : null,
		createdAt: raw.createdAt.toISOString(),
		updatedAt: raw.updatedAt ? raw.updatedAt.toISOString() : null,
	}
}

export function presentProduct(product: Product | { [key: string]: any }) {
	const raw = product as any

	return {
		id: String(raw.id),
		name: raw.name,
		slug: raw.slug?.value ?? raw.slug,
		description: raw.description ?? null,
		status: raw.status,
		brandId: raw.brandId?.toString?.() ?? raw.brandId ?? null,
		primaryCategoryId: raw.primaryCategoryId?.toString?.() ?? raw.primaryCategoryId ?? null,
		categoryIds:
			raw.categoryIds?.map?.((categoryId: { toString(): string }) => categoryId.toString()) ??
			raw.categories?.map?.((category: { categoryId: string }) => category.categoryId) ??
			[],
		variants: raw.variants?.map?.(presentVariant) ?? [],
		images:
			raw.images?.map?.((image: { [key: string]: any }) => ({
				id: String(image.id),
				attachmentId: image.attachmentId?.toString?.() ?? image.attachmentId,
				url: image.url,
				altText: image.altText ?? null,
				position: image.position,
				isPrimary: image.isPrimary,
				createdAt: image.createdAt.toISOString(),
				updatedAt: image.updatedAt ? image.updatedAt.toISOString() : null,
			})) ?? [],
		publishedAt: raw.publishedAt ? raw.publishedAt.toISOString() : null,
		deactivatedAt: raw.deactivatedAt ? raw.deactivatedAt.toISOString() : null,
		createdAt: raw.createdAt.toISOString(),
		updatedAt: raw.updatedAt ? raw.updatedAt.toISOString() : null,
		archivedAt: raw.archivedAt ? raw.archivedAt.toISOString() : null,
	}
}
