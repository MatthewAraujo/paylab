import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Brand } from '@/domain/quintalpet/enterprise/entities/brand'
import { BrandStatus } from '@/domain/quintalpet/enterprise/types/brand-status'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { Prisma, Brand as PrismaBrand } from '@prisma/client'

export class PrismaBrandMapper {
	static toDomain(raw: PrismaBrand): Brand {
		return Brand.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				name: raw.name,
				slug: CatalogSlug.create(raw.slug),
				status: raw.status as BrandStatus,
				logoAttachmentId: raw.logoAttachmentId ? new UniqueEntityID(raw.logoAttachmentId) : null,
				logoUrl: raw.logoUrl,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
				archivedAt: raw.archivedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(brand: Brand): Prisma.BrandUncheckedCreateInput {
		return {
			id: brand.id.toString(),
			storeId: brand.storeId.toString(),
			name: brand.name,
			slug: brand.slug.value,
			status: brand.status,
			logoAttachmentId: brand.logoAttachmentId?.toString(),
			logoUrl: brand.logoUrl ?? undefined,
			createdAt: brand.createdAt,
			updatedAt: brand.updatedAt ?? undefined,
			archivedAt: brand.archivedAt ?? undefined,
		}
	}
}
