import { Injectable } from '@nestjs/common'
import { ProductStatus } from '../../enterprise/types/product-status'
import { CatalogSlug } from '../../enterprise/value-objects/slug'
import { CatalogProductsRepository } from '../repositories/catalog-products-repository'
import { CustomerFavoritesRepository } from '../repositories/customer-favorites-repository'
import { FavoriteProductNotAvailableError } from './errors/favorite-product-not-available-error'

@Injectable()
export class AddFavoriteProductUseCase {
	constructor(
		private readonly favoritesRepository: CustomerFavoritesRepository,
		private readonly catalogProductsRepository: CatalogProductsRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string, productSlug: string): Promise<void> {
		const product = await this.catalogProductsRepository.findBySlug(
			CatalogSlug.create(productSlug),
			storeId,
		)

		if (!product || product.status !== ProductStatus.ACTIVE) {
			throw new FavoriteProductNotAvailableError(productSlug)
		}

		await this.favoritesRepository.addFavorite(storeCustomerId, product.id.toString())
	}
}

export function isFavoritesDomainError(error: unknown) {
	return error instanceof FavoriteProductNotAvailableError
}
