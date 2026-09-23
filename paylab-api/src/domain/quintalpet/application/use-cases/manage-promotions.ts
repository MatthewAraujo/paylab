import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CuratedHomeOffer } from '@/domain/quintalpet/enterprise/entities/curated-home-offer'
import { Promotion, PromotionMutableInput } from '@/domain/quintalpet/enterprise/entities/promotion'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { Injectable, NotFoundException } from '@nestjs/common'
import { CuratedHomeOffersRepository } from '../repositories/curated-home-offers-repository'
import { PromotionsRepository } from '../repositories/promotions-repository'
import { InvalidHomeOfferSelectionError } from './errors/invalid-home-offer-selection-error'

const DEFAULT_PAGE = 1
const DEFAULT_PER_PAGE = 20

export interface CreatePromotionInput {
	storeId: string
	name: string
	targetScope: PromotionTargetScope
	channels: PromotionChannel[]
	visibility?: PromotionVisibility
	priority?: number
	isStackable?: boolean
	startsAt?: Date | null
	endsAt?: Date | null
	conditions?: unknown
	benefits?: unknown
	publicHighlight?: unknown
}

export interface ListPromotionsInput {
	status?: PromotionStatus
	visibility?: PromotionVisibility
	channel?: PromotionChannel
	page?: number
	perPage?: number
}

export type PromotionLifecycleAction = 'activate' | 'deactivate' | 'archive'

export interface CuratedHomeOfferView {
	promotionId: string
	position: number
	name: string
	publicHighlight: Promotion['publicHighlight']
}

@Injectable()
export class ManagePromotionsUseCase {
	constructor(
		private readonly promotionsRepository: PromotionsRepository,
		private readonly curatedHomeOffersRepository: CuratedHomeOffersRepository,
	) {}

	async create(input: CreatePromotionInput): Promise<Promotion> {
		const promotion = Promotion.create({
			storeId: new UniqueEntityID(input.storeId),
			name: input.name,
			targetScope: input.targetScope,
			channels: input.channels,
			visibility: input.visibility,
			priority: input.priority,
			isStackable: input.isStackable,
			startsAt: input.startsAt ?? null,
			endsAt: input.endsAt ?? null,
			conditions: input.conditions,
			benefits: input.benefits,
			publicHighlight: input.publicHighlight,
		})

		await this.promotionsRepository.save(promotion)

		return promotion
	}

	async list(storeId: string, input: ListPromotionsInput = {}) {
		const page = input.page ?? DEFAULT_PAGE
		const perPage = input.perPage ?? DEFAULT_PER_PAGE

		const { items, total } = await this.promotionsRepository.listByStore(storeId, {
			status: input.status,
			visibility: input.visibility,
			channel: input.channel,
			page,
			perPage,
		})

		return { items, total, page, perPage }
	}

	async getById(storeId: string, promotionId: string): Promise<Promotion> {
		return this.resolveExisting(storeId, promotionId)
	}

	async update(
		storeId: string,
		promotionId: string,
		input: PromotionMutableInput,
	): Promise<Promotion> {
		const promotion = await this.resolveExisting(storeId, promotionId)

		promotion.update(input)

		await this.promotionsRepository.save(promotion)

		return promotion
	}

	async changeStatus(
		storeId: string,
		promotionId: string,
		action: PromotionLifecycleAction,
	): Promise<Promotion> {
		const promotion = await this.resolveExisting(storeId, promotionId)

		if (action === 'activate') {
			promotion.activate()
		} else if (action === 'deactivate') {
			promotion.deactivate()
		} else {
			promotion.archive()
		}

		await this.promotionsRepository.save(promotion)

		// A promotion that is no longer eligible for public discovery must not
		// keep occupying a curated home slot. This is an explicit cleanup, not a
		// database cascade.
		if (action === 'deactivate' || action === 'archive') {
			await this.curatedHomeOffersRepository.removeByPromotionId(promotionId, storeId)
		}

		return promotion
	}

	async listHomeOffers(storeId: string): Promise<{ offers: CuratedHomeOfferView[] }> {
		const curated = await this.curatedHomeOffersRepository.listByStore(storeId)

		const offers: CuratedHomeOfferView[] = []
		for (const offer of curated) {
			const promotion = await this.promotionsRepository.findById(
				offer.promotionId.toString(),
				storeId,
			)
			if (!promotion) {
				continue
			}
			offers.push({
				promotionId: offer.promotionId.toString(),
				position: offer.position,
				name: promotion.name,
				publicHighlight: promotion.publicHighlight,
			})
		}

		return { offers }
	}

	async replaceHomeOffers(
		storeId: string,
		promotionIds: string[],
	): Promise<{ offers: CuratedHomeOfferView[] }> {
		const seen = new Set<string>()
		const offers: CuratedHomeOffer[] = []
		let position = 1

		for (const promotionId of promotionIds) {
			if (seen.has(promotionId)) {
				throw new InvalidHomeOfferSelectionError(
					'a promotion cannot appear more than once in the curated home lane',
				)
			}
			seen.add(promotionId)

			const promotion = await this.promotionsRepository.findById(promotionId, storeId)
			if (!promotion) {
				throw new InvalidHomeOfferSelectionError(
					'every curated home offer must reference a promotion from this store',
				)
			}
			if (!promotion.isEligibleForPublicDiscovery()) {
				throw new InvalidHomeOfferSelectionError(
					'only active public promotions eligible for storefront discovery can be curated as home offers',
				)
			}

			offers.push(
				CuratedHomeOffer.create({
					storeId: new UniqueEntityID(storeId),
					promotionId: new UniqueEntityID(promotionId),
					position: position++,
				}),
			)
		}

		await this.curatedHomeOffersRepository.replaceForStore(storeId, offers)

		return this.listHomeOffers(storeId)
	}

	private async resolveExisting(storeId: string, promotionId: string): Promise<Promotion> {
		const promotion = await this.promotionsRepository.findById(promotionId, storeId)
		if (!promotion) {
			throw new NotFoundException('Promotion not found.')
		}
		return promotion
	}
}
