import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { HomeMerchandisingConfigurationsRepository } from '@/domain/quintalpet/application/repositories/home-merchandising-configurations-repository'
import { HomeMerchandisingConfiguration } from '@/domain/quintalpet/enterprise/entities/home-merchandising-configuration'
import { DuplicateMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/duplicate-merchandising-reference-error'
import { InvalidMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/invalid-merchandising-reference-error'
import { MerchandisingLimitExceededError } from '@/domain/quintalpet/enterprise/errors/merchandising-limit-exceeded-error'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

const MAX_FEATURED_CATEGORIES_PER_DEPARTMENT = 3

type CategorySummary = { id: string; storeId: string; parentCategoryId: string | null }

@Injectable()
export class ManageMerchandisingUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly configurationsRepository: HomeMerchandisingConfigurationsRepository,
	) {}

	async replaceFeaturedCategories(input: { storeId: string; featuredCategoryIds: string[] }) {
		const configuration = await this.getOrCreateConfiguration(input.storeId)
		const categories = await this.prisma.category.findMany({
			where: {
				storeId: input.storeId,
				id: { in: input.featuredCategoryIds },
			},
			select: { id: true, storeId: true, parentCategoryId: true },
		})

		if (categories.length !== input.featuredCategoryIds.length) {
			throw new InvalidMerchandisingReferenceError('category')
		}

		const categoriesById = new Map(categories.map((category) => [category.id, category]))

		this.assertDepartmentLimits(input.featuredCategoryIds, categoriesById)

		configuration.replaceFeaturedCategories(
			this.mapOrderedCategoryReferences(input.featuredCategoryIds, categoriesById),
		)

		await this.configurationsRepository.save(configuration)

		return this.getFeaturedCategories(input.storeId)
	}

	async replaceFeaturedProducts(input: { storeId: string; featuredProductIds: string[] }) {
		const configuration = await this.getOrCreateConfiguration(input.storeId)
		const products = await this.prisma.product.findMany({
			where: {
				storeId: input.storeId,
				id: { in: input.featuredProductIds },
			},
			select: { id: true, storeId: true },
		})

		if (products.length !== input.featuredProductIds.length) {
			throw new InvalidMerchandisingReferenceError('product')
		}

		const productsById = new Map(products.map((product) => [product.id, product]))

		configuration.replaceFeaturedProducts(
			input.featuredProductIds.map((productId) => {
				const product = productsById.get(productId)

				if (!product) {
					throw new InvalidMerchandisingReferenceError('product')
				}

				return {
					entityId: new UniqueEntityID(product.id),
					storeId: new UniqueEntityID(product.storeId),
				}
			}),
		)

		await this.configurationsRepository.save(configuration)

		return this.getFeaturedProducts(input.storeId)
	}

	async getHomeConfiguration(storeId: string) {
		const [featuredCategories, featuredProducts] = await Promise.all([
			this.getFeaturedCategories(storeId),
			this.getFeaturedProducts(storeId),
		])

		return {
			featuredCategories: featuredCategories.featuredCategories,
			featuredProducts: featuredProducts.featuredProducts,
		}
	}

	async getFeaturedCategories(storeId: string) {
		const items = await this.prisma.merchandisingFeaturedCategory.findMany({
			where: { storeId: storeId },
			include: {
				category: {
					select: {
						id: true,
						name: true,
						slug: true,
						parentCategoryId: true,
					},
				},
			},
			orderBy: { position: 'asc' },
		})

		return {
			featuredCategories: items.map((reference) => ({
				categoryId: reference.categoryId,
				position: reference.position,
				name: reference.category.name,
				slug: reference.category.slug,
				parentId: reference.category.parentCategoryId,
			})),
		}
	}

	async getFeaturedProducts(storeId: string) {
		const items = await this.prisma.merchandisingFeaturedProduct.findMany({
			where: { storeId: storeId },
			include: {
				product: {
					select: {
						id: true,
						name: true,
						slug: true,
					},
				},
			},
			orderBy: { position: 'asc' },
		})

		return {
			featuredProducts: items.map((reference) => ({
				productId: reference.productId,
				position: reference.position,
				name: reference.product.name,
				slug: reference.product.slug,
			})),
		}
	}

	private async getOrCreateConfiguration(storeId: string) {
		return (
			(await this.configurationsRepository.findByStoreId(storeId)) ??
			HomeMerchandisingConfiguration.create({
				storeId: new UniqueEntityID(storeId),
			})
		)
	}

	/**
	 * A category's "department" is its root ancestor, resolved here (not
	 * stored) so adding a new department is a data change, not a code change.
	 * Categories without a parent are grouped under themselves.
	 */
	private assertDepartmentLimits(
		categoryIds: string[],
		categoriesById: Map<string, CategorySummary>,
	) {
		const countByDepartment = new Map<string, number>()

		for (const categoryId of categoryIds) {
			const category = categoriesById.get(categoryId)
			const departmentId = category?.parentCategoryId ?? categoryId
			countByDepartment.set(departmentId, (countByDepartment.get(departmentId) ?? 0) + 1)
		}

		for (const count of countByDepartment.values()) {
			if (count > MAX_FEATURED_CATEGORIES_PER_DEPARTMENT) {
				throw new MerchandisingLimitExceededError(
					'category',
					MAX_FEATURED_CATEGORIES_PER_DEPARTMENT,
				)
			}
		}
	}

	private mapOrderedCategoryReferences(
		categoryIds: string[],
		categoriesById: Map<string, CategorySummary>,
	) {
		return categoryIds.map((categoryId) => {
			const category = categoriesById.get(categoryId)

			if (!category) {
				throw new InvalidMerchandisingReferenceError('category')
			}

			return {
				entityId: new UniqueEntityID(category.id),
				storeId: new UniqueEntityID(category.storeId),
			}
		})
	}
}

export function isMerchandisingDomainError(error: unknown) {
	return (
		error instanceof DuplicateMerchandisingReferenceError ||
		error instanceof InvalidMerchandisingReferenceError ||
		error instanceof MerchandisingLimitExceededError
	)
}
