import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { ProductImage } from '@/domain/quintalpet/enterprise/entities/product-image'
import { Prisma, ProductImage as PrismaProductImage } from '@prisma/client'

export class PrismaProductImageMapper {
	static toDomain(raw: PrismaProductImage): ProductImage {
		return ProductImage.create(
			{
				attachmentId: new UniqueEntityID(raw.attachmentId),
				url: raw.url,
				altText: raw.altText,
				position: raw.position,
				isPrimary: raw.isPrimary,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(
		image: ProductImage,
		input: { storeId: string; productId: string },
	): Prisma.ProductImageUncheckedCreateInput {
		return {
			id: image.id.toString(),
			storeId: input.storeId,
			productId: input.productId,
			attachmentId: image.attachmentId.toString(),
			url: image.url,
			altText: image.altText ?? undefined,
			position: image.position,
			isPrimary: image.isPrimary,
			createdAt: image.createdAt ?? undefined,
			updatedAt: image.updatedAt ?? undefined,
		}
	}
}
