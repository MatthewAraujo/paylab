import { CustomerFavoritesRepository } from '@/domain/quintalpet/application/repositories/customer-favorites-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { CatalogProductStatus } from '@prisma/client'

@Injectable()
export class PrismaCustomerFavoritesRepository implements CustomerFavoritesRepository {
	constructor(private readonly prisma: PrismaService) {}

	async listVisibleProductIds(storeCustomerId: string): Promise<string[]> {
		const rows = await this.prisma.customerFavorite.findMany({
			where: {
				storeCustomerId,
				product: { status: CatalogProductStatus.ACTIVE },
			},
			select: { productId: true },
		})

		return rows.map((row) => row.productId)
	}

	async listAllProductIds(storeCustomerId: string): Promise<string[]> {
		const rows = await this.prisma.customerFavorite.findMany({
			where: { storeCustomerId },
			select: { productId: true },
		})

		return rows.map((row) => row.productId)
	}

	async replaceVisibleFavorites(storeCustomerId: string, productIds: string[]): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			const persisted = await tx.customerFavorite.findMany({
				where: { storeCustomerId },
				select: {
					productId: true,
					product: { select: { status: true } },
				},
			})

			const visiblePersistedIds = persisted
				.filter((row) => row.product.status === CatalogProductStatus.ACTIVE)
				.map((row) => row.productId)

			const visiblePersistedSet = new Set(visiblePersistedIds)
			const incomingSet = new Set(productIds)

			const toRemove = visiblePersistedIds.filter((id) => !incomingSet.has(id))
			const toAdd = productIds.filter((id) => !visiblePersistedSet.has(id))

			if (toRemove.length > 0) {
				await tx.customerFavorite.deleteMany({
					where: { storeCustomerId, productId: { in: toRemove } },
				})
			}

			if (toAdd.length > 0) {
				await tx.customerFavorite.createMany({
					data: toAdd.map((productId) => ({ storeCustomerId, productId })),
					skipDuplicates: true,
				})
			}
		})
	}

	async addFavorite(storeCustomerId: string, productId: string): Promise<void> {
		await this.prisma.customerFavorite.upsert({
			where: { storeCustomerId_productId: { storeCustomerId, productId } },
			create: { storeCustomerId, productId },
			update: {},
		})
	}

	async removeFavorite(storeCustomerId: string, productId: string): Promise<void> {
		await this.prisma.customerFavorite.deleteMany({
			where: { storeCustomerId, productId },
		})
	}
}
