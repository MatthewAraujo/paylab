import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { CategoryStatus } from '@/domain/quintalpet/enterprise/types/category-status'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { Prisma, Category as PrismaCategory } from '@prisma/client'

export class PrismaCategoryMapper {
	static toDomain(raw: PrismaCategory): Category {
		return Category.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				name: raw.name,
				slug: CatalogSlug.create(raw.slug),
				status: raw.status as CategoryStatus,
				parentCategoryId: raw.parentCategoryId ? new UniqueEntityID(raw.parentCategoryId) : null,
				imageAttachmentId: raw.imageAttachmentId ? new UniqueEntityID(raw.imageAttachmentId) : null,
				imageUrl: raw.imageUrl,
				isVisibleOnHome: raw.isVisibleOnHome,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
				archivedAt: raw.archivedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(category: Category): Prisma.CategoryUncheckedCreateInput {
		return {
			id: category.id.toString(),
			storeId: category.storeId.toString(),
			parentCategoryId: category.parentCategoryId?.toString(),
			name: category.name,
			slug: category.slug.value,
			status: category.status,
			imageAttachmentId: category.imageAttachmentId?.toString(),
			imageUrl: category.imageUrl ?? undefined,
			isVisibleOnHome: category.isVisibleOnHome,
			createdAt: category.createdAt,
			updatedAt: category.updatedAt ?? undefined,
			archivedAt: category.archivedAt ?? undefined,
		}
	}
}
