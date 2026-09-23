import { CuratedHomeOffer } from '../../enterprise/entities/curated-home-offer'

export abstract class CuratedHomeOffersRepository {
	/** Ordered by `position` ascending. */
	abstract listByStore(storeId: string): Promise<CuratedHomeOffer[]>

	/**
	 * Replaces the whole curated lane for one store in a single transaction.
	 * Positions are taken from each offer as provided by the caller.
	 */
	abstract replaceForStore(storeId: string, offers: CuratedHomeOffer[]): Promise<void>

	abstract removeByPromotionId(promotionId: string, storeId: string): Promise<void>
}
