import { Injectable } from '@nestjs/common'
import { CatalogProductsRepository } from '../repositories/catalog-products-repository'
import { CustomerFavoritesRepository } from '../repositories/customer-favorites-repository'

@Injectable()
export class GetFavoriteProductSlugsUseCase {
	constructor(
		private readonly favoritesRepository: CustomerFavoritesRepository,
		private readonly catalogProductsRepository: CatalogProductsRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string): Promise<string[]> {
		const visibleProductIds = await this.favoritesRepository.listVisibleProductIds(storeCustomerId)

		// N+1 lookup accepted as a tradeoff for this phase's data volumes (see T3 task notes) —
		// CatalogProductsRepository only exposes a singular findById.
		const products = await Promise.all(
			visibleProductIds.map((productId) =>
				this.catalogProductsRepository.findById(productId, storeId),
			),
		)

		return products
			.filter((product): product is NonNullable<typeof product> => product !== null)
			.map((product) => product.slug.value)
	}
}
