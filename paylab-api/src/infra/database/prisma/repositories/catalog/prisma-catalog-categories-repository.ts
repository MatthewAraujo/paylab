import { CatalogCategoriesRepository } from '@/domain/quintalpet/application/repositories/catalog-categories-repository'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { PrismaCategoryMapper } from '@/infra/database/prisma/mappers/prisma-category-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class PrismaCatalogCategoriesRepository implements CatalogCategoriesRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(id: string, storeId: string): Promise<Category | null> {
		const category = await this.prisma.category.findFirst({
			where: { id, storeId: storeId },
		})

		return category ? PrismaCategoryMapper.toDomain(category) : null
	}

	async findBySlug(slug: CatalogSlug, storeId: string): Promise<Category | null> {
		const category = await this.prisma.category.findFirst({
			where: { storeId: storeId, slug: slug.value },
		})

		return category ? PrismaCategoryMapper.toDomain(category) : null
	}

	async listAncestorIds(id: string, storeId: string): Promise<string[]> {
		const ancestors: string[] = []
		let currentId = id

		while (true) {
			const category = await this.prisma.category.findFirst({
				where: { id: currentId, storeId: storeId },
				select: { parentCategoryId: true },
			})

			if (!category?.parentCategoryId) {
				return ancestors
			}

			ancestors.push(category.parentCategoryId)
			currentId = category.parentCategoryId
		}
	}

	async listDescendantIds(id: string, storeId: string): Promise<string[]> {
		const descendants: string[] = []
		let frontier = [id]

		while (frontier.length > 0) {
			const children = await this.prisma.category.findMany({
				where: { storeId, parentCategoryId: { in: frontier } },
				select: { id: true },
				orderBy: { id: 'asc' },
			})
			const childIds = children
				.map((child) => child.id)
				.filter((childId) => childId !== id && !descendants.includes(childId))
			if (childIds.length === 0) break
			descendants.push(...childIds)
			frontier = childIds
		}

		return descendants
	}

	async save(category: Category, tx?: Prisma.TransactionClient): Promise<void> {
		const client = tx ?? this.prisma
		const data = PrismaCategoryMapper.toPrisma(category)

		await client.category.upsert({
			where: { id: category.id.toString() },
			create: data,
			update: data,
		})
	}
}
