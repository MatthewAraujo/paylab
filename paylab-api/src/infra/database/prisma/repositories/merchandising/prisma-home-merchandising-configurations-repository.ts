import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { HomeMerchandisingConfigurationsRepository } from '@/domain/quintalpet/application/repositories/home-merchandising-configurations-repository'
import { HomeMerchandisingConfiguration } from '@/domain/quintalpet/enterprise/entities/home-merchandising-configuration'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class PrismaHomeMerchandisingConfigurationsRepository
	implements HomeMerchandisingConfigurationsRepository
{
	constructor(private readonly prisma: PrismaService) {}

	async findByStoreId(storeId: string): Promise<HomeMerchandisingConfiguration | null> {
		const [featuredCategories, featuredProducts] = await Promise.all([
			this.prisma.merchandisingFeaturedCategory.findMany({
				where: { storeId: storeId },
				orderBy: { position: 'asc' },
			}),
			this.prisma.merchandisingFeaturedProduct.findMany({
				where: { storeId: storeId },
				orderBy: { position: 'asc' },
			}),
		])

		if (featuredCategories.length === 0 && featuredProducts.length === 0) {
			return null
		}

		return HomeMerchandisingConfiguration.create({
			storeId: new UniqueEntityID(storeId),
			featuredCategoryIds: featuredCategories.map(
				(reference) => new UniqueEntityID(reference.categoryId),
			),
			featuredProductIds: featuredProducts.map(
				(reference) => new UniqueEntityID(reference.productId),
			),
			createdAt: this.resolveCreatedAt(featuredCategories, featuredProducts),
			updatedAt: this.resolveUpdatedAt(featuredCategories, featuredProducts),
		})
	}

	async save(configuration: HomeMerchandisingConfiguration): Promise<void> {
		const storeId = configuration.storeId.toString()

		await this.prisma.$transaction(async (tx) => {
			await tx.merchandisingFeaturedCategory.deleteMany({
				where: { storeId: storeId },
			})
			await tx.merchandisingFeaturedProduct.deleteMany({
				where: { storeId: storeId },
			})

			if (configuration.featuredCategoryIds.length > 0) {
				await tx.merchandisingFeaturedCategory.createMany({
					data: configuration.featuredCategoryIds.map((categoryId, index) => ({
						storeId: storeId,
						categoryId: categoryId.toString(),
						position: index,
					})),
				})
			}

			if (configuration.featuredProductIds.length > 0) {
				await tx.merchandisingFeaturedProduct.createMany({
					data: configuration.featuredProductIds.map((productId, index) => ({
						storeId: storeId,
						productId: productId.toString(),
						position: index,
					})),
				})
			}
		})
	}

	private resolveCreatedAt(
		featuredCategories: Array<{ createdAt: Date }>,
		featuredProducts: Array<{ createdAt: Date }>,
	) {
		const timestamps = [...featuredCategories, ...featuredProducts].map(
			(reference) => reference.createdAt,
		)
		return timestamps.length > 0
			? new Date(Math.min(...timestamps.map((value) => value.getTime())))
			: new Date()
	}

	private resolveUpdatedAt(
		featuredCategories: Array<{ updatedAt: Date }>,
		featuredProducts: Array<{ updatedAt: Date }>,
	) {
		const timestamps = [...featuredCategories, ...featuredProducts].map(
			(reference) => reference.updatedAt,
		)
		return timestamps.length > 0
			? new Date(Math.max(...timestamps.map((value) => value.getTime())))
			: null
	}
}
