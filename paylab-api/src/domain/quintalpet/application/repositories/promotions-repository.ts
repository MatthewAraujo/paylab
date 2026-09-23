import { Prisma } from '@prisma/client'
import { Promotion } from '../../enterprise/entities/promotion'
import { PromotionChannel } from '../../enterprise/types/promotion-channel'
import { PromotionStatus } from '../../enterprise/types/promotion-status'
import { PromotionVisibility } from '../../enterprise/types/promotion-visibility'

export interface ListPromotionsByStoreFilters {
	status?: PromotionStatus
	visibility?: PromotionVisibility
	channel?: PromotionChannel
	page: number
	perPage: number
}

export interface PaginatedPromotions {
	items: Promotion[]
	total: number
}

export interface ListActivePromotionsOptions {
	/** Defaults to "now" in the repository. */
	at?: Date
	visibility?: PromotionVisibility
}

export abstract class PromotionsRepository {
	abstract findById(id: string, storeId: string): Promise<Promotion | null>

	abstract listByStore(
		storeId: string,
		filters: ListPromotionsByStoreFilters,
	): Promise<PaginatedPromotions>

	/**
	 * Active promotions for one store and channel, ordered by priority (desc) then
	 * creation time (asc). Never leaks other stores' data; `DRAFT`, `INACTIVE`,
	 * `ARCHIVED`, out-of-window, and wrong-channel rows are excluded.
	 */
	abstract listActiveForChannel(
		storeId: string,
		channel: PromotionChannel,
		options?: ListActivePromotionsOptions,
	): Promise<Promotion[]>

	abstract save(promotion: Promotion, tx?: Prisma.TransactionClient): Promise<void>
}
