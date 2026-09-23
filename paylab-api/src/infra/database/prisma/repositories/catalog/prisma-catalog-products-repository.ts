import { CatalogProductsRepository } from '@/domain/quintalpet/application/repositories/catalog-products-repository'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { Sku } from '@/domain/quintalpet/enterprise/value-objects/sku'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { PrismaProductImageMapper } from '@/infra/database/prisma/mappers/prisma-product-image-mapper'
import {
	PrismaProductAggregate,
	PrismaProductMapper,
} from '@/infra/database/prisma/mappers/prisma-product-mapper'
import { PrismaProductVariantMapper } from '@/infra/database/prisma/mappers/prisma-product-variant-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const productAggregateInclude = {
	categories: true,
	variants: {
		orderBy: { createdAt: 'asc' as const },
	},
	images: {
		orderBy: { position: 'asc' as const },
	},
}

@Injectable()
export class PrismaCatalogProductsRepository implements CatalogProductsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(id: string, storeId: string): Promise<Product | null> {
		const product = await this.prisma.product.findFirst({
			where: { id, storeId: storeId },
			include: productAggregateInclude,
		})

		return product ? PrismaProductMapper.toDomain(product as PrismaProductAggregate) : null
	}

	async findBySlug(slug: CatalogSlug, storeId: string): Promise<Product | null> {
		const product = await this.prisma.product.findFirst({
			where: { storeId: storeId, slug: slug.value },
			include: productAggregateInclude,
		})

		return product ? PrismaProductMapper.toDomain(product as PrismaProductAggregate) : null
	}

	async skuExists(sku: Sku, storeId: string, exceptProductId?: string): Promise<boolean> {
		const variant = await this.prisma.productVariant.findFirst({
			where: {
				storeId: storeId,
				sku: sku.value,
				productId: exceptProductId ? { not: exceptProductId } : undefined,
			},
			select: { id: true },
		})

		return variant !== null
	}

	async save(product: Product, tx?: Prisma.TransactionClient): Promise<void> {
		// When the caller already owns a transaction (e.g. the bulk CSV import,
		// T3), persist against it directly — opening a nested `$transaction`
		// here isn't available on an interactive transaction client and would
		// break the caller's all-or-nothing guarantee.
		if (tx) {
			await this.persist(product, tx)
			return
		}

		await this.prisma.$transaction((innerTx) => this.persist(product, innerTx))
	}

	private async persist(product: Product, tx: Prisma.TransactionClient): Promise<void> {
		const productData = PrismaProductMapper.toPrisma(product)
		const storeId = product.storeId.toString()
		const productId = product.id.toString()
		const currentVariantIds = product.variants.map((variant) => variant.id.toString())

		await tx.product.upsert({
			where: { id: productId },
			create: productData,
			update: productData,
		})

		await tx.productCategory.deleteMany({
			where: { productId },
		})

		// Preserve stable variant rows for existing ids so variant-owned inventory,
		// barcode, and movement relations survive non-destructive product saves.
		// Only variants actually removed from the aggregate are deleted.
		await tx.productVariant.deleteMany({
			where: {
				productId,
				id: currentVariantIds.length > 0 ? { notIn: currentVariantIds } : undefined,
			},
		})

		if (product.categoryIds.length > 0) {
			await tx.productCategory.createMany({
				data: product.categoryIds.map((categoryId) => ({
					storeId: storeId,
					productId,
					categoryId: categoryId.toString(),
				})),
			})
		}

		if (product.variants.length > 0) {
			for (const variant of product.variants) {
				const variantData = PrismaProductVariantMapper.toPrisma(variant, { storeId, productId })

				await tx.productVariant.upsert({
					where: { id: variant.id.toString() },
					create: variantData,
					update: variantData,
				})
			}
		}

		const removedImageIds = product.imageList.getRemovedItems().map((image) => image.id.toString())

		if (removedImageIds.length > 0) {
			await tx.productImage.deleteMany({
				where: {
					productId,
					id: {
						in: removedImageIds,
					},
				},
			})
		}

		for (const image of product.images) {
			await tx.productImage.upsert({
				where: { id: image.id.toString() },
				create: PrismaProductImageMapper.toPrisma(image, { storeId, productId }),
				update: PrismaProductImageMapper.toPrisma(image, { storeId, productId }),
			})
		}
	}
}
