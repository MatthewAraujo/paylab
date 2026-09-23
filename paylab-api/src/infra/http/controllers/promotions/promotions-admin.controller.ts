import { ManagePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/manage-promotions'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common'
import { z } from 'zod'
import { presentPromotion } from './present-promotion'

const channelSchema = z.nativeEnum(PromotionChannel)
const rulePayloadSchema = z.array(z.record(z.string(), z.unknown()))

const createPromotionBodySchema = z.object({
	name: z.string().trim().min(1),
	targetScope: z.nativeEnum(PromotionTargetScope),
	channels: z.array(channelSchema).min(1),
	visibility: z.nativeEnum(PromotionVisibility).optional(),
	priority: z.number().int().optional(),
	isStackable: z.boolean().optional(),
	startsAt: z.coerce.date().nullable().optional(),
	endsAt: z.coerce.date().nullable().optional(),
	conditions: rulePayloadSchema.optional(),
	benefits: rulePayloadSchema.optional(),
	publicHighlight: z.record(z.string(), z.unknown()).nullable().optional(),
})

const updatePromotionBodySchema = z.object({
	name: z.string().trim().min(1).optional(),
	targetScope: z.nativeEnum(PromotionTargetScope).optional(),
	channels: z.array(channelSchema).min(1).optional(),
	visibility: z.nativeEnum(PromotionVisibility).optional(),
	priority: z.number().int().optional(),
	isStackable: z.boolean().optional(),
	startsAt: z.coerce.date().nullable().optional(),
	endsAt: z.coerce.date().nullable().optional(),
	conditions: rulePayloadSchema.optional(),
	benefits: rulePayloadSchema.optional(),
	publicHighlight: z.record(z.string(), z.unknown()).nullable().optional(),
})

const listPromotionsQuerySchema = z.object({
	status: z.nativeEnum(PromotionStatus).optional(),
	visibility: z.nativeEnum(PromotionVisibility).optional(),
	channel: channelSchema.optional(),
	page: z.coerce.number().int().positive().max(100_000).optional(),
	perPage: z.coerce.number().int().positive().max(100).optional(),
})

const replaceHomeOffersBodySchema = z.object({
	promotionIds: z.array(z.string().uuid()),
})

type CreatePromotionBody = z.infer<typeof createPromotionBodySchema>
type UpdatePromotionBody = z.infer<typeof updatePromotionBodySchema>
type ListPromotionsQuery = z.infer<typeof listPromotionsQuerySchema>
type ReplaceHomeOffersBody = z.infer<typeof replaceHomeOffersBodySchema>

@Controller('/api/v1/admin/promotions')
@StoreMemberOnly()
export class PromotionsAdminController {
	constructor(private readonly promotions: ManagePromotionsUseCase) {}

	@Get('/home-offers')
	async listHomeOffers(@CurrentStoreId() storeId: string) {
		return this.promotions.listHomeOffers(storeId)
	}

	@Put('/home-offers')
	@HttpCode(200)
	async replaceHomeOffers(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(replaceHomeOffersBodySchema)) body: ReplaceHomeOffersBody,
	) {
		try {
			return await this.promotions.replaceHomeOffers(storeId, body.promotionIds)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post()
	@HttpCode(201)
	async create(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(createPromotionBodySchema)) body: CreatePromotionBody,
	) {
		try {
			const promotion = await this.promotions.create({ storeId, ...body })
			return presentPromotion(promotion)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get()
	async list(
		@CurrentStoreId() storeId: string,
		@Query(new ZodValidationPipe(listPromotionsQuerySchema)) query: ListPromotionsQuery,
	) {
		const { items, total, page, perPage } = await this.promotions.list(storeId, query)
		return { items: items.map(presentPromotion), total, page, perPage }
	}

	@Get('/:promotionId')
	async getById(@CurrentStoreId() storeId: string, @UuidParam('promotionId') promotionId: string) {
		try {
			return presentPromotion(await this.promotions.getById(storeId, promotionId))
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Put('/:promotionId')
	@HttpCode(200)
	async update(
		@CurrentStoreId() storeId: string,
		@UuidParam('promotionId') promotionId: string,
		@Body(new ZodValidationPipe(updatePromotionBodySchema)) body: UpdatePromotionBody,
	) {
		try {
			const promotion = await this.promotions.update(storeId, promotionId, body)
			return presentPromotion(promotion)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:promotionId/activate')
	@HttpCode(200)
	async activate(@CurrentStoreId() storeId: string, @UuidParam('promotionId') promotionId: string) {
		return this.transition(storeId, promotionId, 'activate')
	}

	@Post('/:promotionId/deactivate')
	@HttpCode(200)
	async deactivate(
		@CurrentStoreId() storeId: string,
		@UuidParam('promotionId') promotionId: string,
	) {
		return this.transition(storeId, promotionId, 'deactivate')
	}

	@Post('/:promotionId/archive')
	@HttpCode(200)
	async archive(@CurrentStoreId() storeId: string, @UuidParam('promotionId') promotionId: string) {
		return this.transition(storeId, promotionId, 'archive')
	}

	private async transition(
		storeId: string,
		promotionId: string,
		action: 'activate' | 'deactivate' | 'archive',
	) {
		try {
			const promotion = await this.promotions.changeStatus(storeId, promotionId, action)
			return presentPromotion(promotion)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}
}
