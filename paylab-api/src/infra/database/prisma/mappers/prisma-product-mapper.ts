import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { ProductStatus } from '@/domain/quintalpet/enterprise/types/product-status'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { Prisma } from '@prisma/client'
import { PrismaProductImageMapper } from './prisma-product-image-mapper'
import { PrismaProductVariantMapper } from './prisma-product-variant-mapper'

export type PrismaProductAggregate = Prisma.ProductGetPayload<{
	include: {
		categories: true
		variants: {
			orderBy: { createdAt: 'asc' }
		}
		images: {
			orderBy: { position: 'asc' }
		}
	}
}>

export class PrismaProductMapper {
	static toDomain(raw: PrismaProductAggregate): Product {
		return Product.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				name: raw.name,
				slug: CatalogSlug.create(raw.slug),
				description: raw.description,
				brandId: raw.brandId ? new UniqueEntityID(raw.brandId) : null,
				status: raw.status as ProductStatus,
				primaryCategoryId: raw.primaryCategoryId ? new UniqueEntityID(raw.primaryCategoryId) : null,
				categoryIds: raw.categories.map((item) => new UniqueEntityID(item.categoryId)),
				variants: raw.variants.map(PrismaProductVariantMapper.toDomain),
				images: raw.images.map(PrismaProductImageMapper.toDomain),
				publishedAt: raw.publishedAt,
				deactivatedAt: raw.deactivatedAt,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
				archivedAt: raw.archivedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(product: Product): Prisma.ProductUncheckedCreateInput {
		return {
			id: product.id.toString(),
			storeId: product.storeId.toString(),
			brandId: product.brandId?.toString(),
			primaryCategoryId: product.primaryCategoryId?.toString(),
			name: product.name,
			slug: product.slug.value,
			description: product.description ?? undefined,
			status: product.status,
			publishedAt: product.publishedAt ?? undefined,
			deactivatedAt: product.deactivatedAt ?? undefined,
			createdAt: product.createdAt,
			updatedAt: product.updatedAt ?? undefined,
			archivedAt: product.archivedAt ?? undefined,
		}
	}
}
