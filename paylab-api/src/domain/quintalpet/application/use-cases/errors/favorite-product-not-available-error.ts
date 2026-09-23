export class FavoriteProductNotAvailableError extends Error {
	constructor(public readonly productSlug: string) {
		super(`Product "${productSlug}" is not available to favorite in this store.`)
	}
}
