import { Injectable } from '@nestjs/common'
import { CatalogSlug } from '../../enterprise/value-objects/slug'
import { CatalogProductsRepository } from '../repositories/catalog-products-repository'
import { CustomerFavoritesRepository } from '../repositories/customer-favorites-repository'

@Injectable()
export class RemoveFavoriteProductUseCase {
	constructor(
		private readonly favoritesRepository: CustomerFavoritesRepository,
		private readonly catalogProductsRepository: CatalogProductsRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string, productSlug: string): Promise<void> {
		// Removal is safe/idempotent even if the slug never resolves to a product in this
		// store, or was never favorited — matches PRD "safe even if already absent".
		const product = await this.catalogProductsRepository.findBySlug(
			CatalogSlug.create(productSlug),
			storeId,
		)
		if (!product) return

		await this.favoritesRepository.removeFavorite(storeCustomerId, product.id.toString())
	}
}
