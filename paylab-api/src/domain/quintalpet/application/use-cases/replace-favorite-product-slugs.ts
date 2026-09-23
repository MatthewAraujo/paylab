import { Injectable } from '@nestjs/common'
import { ProductStatus } from '../../enterprise/types/product-status'
import { CatalogSlug } from '../../enterprise/value-objects/slug'
import { CatalogProductsRepository } from '../repositories/catalog-products-repository'
import { CustomerFavoritesRepository } from '../repositories/customer-favorites-repository'

@Injectable()
export class ReplaceFavoriteProductSlugsUseCase {
	constructor(
		private readonly favoritesRepository: CustomerFavoritesRepository,
		private readonly catalogProductsRepository: CatalogProductsRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string, productSlugs: string[]): Promise<void> {
		// Sync semantics: unknown/inactive/cross-tenant slugs are silently dropped rather than
		// failing the whole request — see T3 task notes ("normalize, don't fail the request").
		const products = await Promise.all(
			productSlugs.map((slug) =>
				this.catalogProductsRepository.findBySlug(CatalogSlug.create(slug), storeId),
			),
		)

		const validProductIds = products
			.filter((product): product is NonNullable<typeof product> => product !== null)
			.filter((product) => product.status === ProductStatus.ACTIVE)
			.map((product) => product.id.toString())

		await this.favoritesRepository.replaceVisibleFavorites(storeCustomerId, validProductIds)
	}
}
