export abstract class CustomerFavoritesRepository {
	abstract listVisibleProductIds(storeCustomerId: string): Promise<string[]>
	abstract listAllProductIds(storeCustomerId: string): Promise<string[]>
	abstract replaceVisibleFavorites(storeCustomerId: string, productIds: string[]): Promise<void>
	abstract addFavorite(storeCustomerId: string, productId: string): Promise<void>
	abstract removeFavorite(storeCustomerId: string, productId: string): Promise<void>
}
