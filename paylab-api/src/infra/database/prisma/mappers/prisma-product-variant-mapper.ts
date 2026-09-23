import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { ProductVariant } from '@/domain/quintalpet/enterprise/entities/product-variant'
import { ProductVariantStatus } from '@/domain/quintalpet/enterprise/types/product-variant-status'
import { Money } from '@/domain/quintalpet/enterprise/value-objects/money'
import { Sku } from '@/domain/quintalpet/enterprise/value-objects/sku'
import { Prisma, ProductVariant as PrismaProductVariant } from '@prisma/client'

function toAttributesMap(attributes: Prisma.JsonValue): Record<string, string> {
	if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
		return {}
	}

	return Object.fromEntries(
		Object.entries(attributes).map(([key, value]) => [key, value == null ? '' : String(value)]),
	)
}

export class PrismaProductVariantMapper {
	static toDomain(raw: PrismaProductVariant): ProductVariant {
		return ProductVariant.create(
			{
				name: raw.name,
				sku: Sku.create(raw.sku),
				barcode: raw.barcode,
				status: raw.status as ProductVariantStatus,
				price: Money.create(raw.priceCents),
				cost: raw.costCents == null ? null : Money.create(raw.costCents),
				attributes: toAttributesMap(raw.attributes),
				deactivatedAt: raw.deactivatedAt,
				archivedAt: raw.archivedAt,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(
		variant: ProductVariant,
		input: { storeId: string; productId: string },
	): Prisma.ProductVariantUncheckedCreateInput {
		return {
			id: variant.id.toString(),
			storeId: input.storeId,
			productId: input.productId,
			name: variant.name,
			sku: variant.sku.value,
			barcode: variant.barcode,
			status: variant.status,
			priceCents: variant.price.amountInCents,
			costCents: variant.cost?.amountInCents,
			attributes: variant.attributes,
			deactivatedAt: variant.deactivatedAt ?? undefined,
			archivedAt: variant.archivedAt ?? undefined,
			createdAt: variant.createdAt,
			updatedAt: variant.updatedAt ?? undefined,
		}
	}
}
