import { DiscoverPromotionsUseCase } from '@/domain/quintalpet/application/use-cases/discover-promotions'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

const discoveryQuerySchema = z.object({
	store: z.string().min(1).optional(),
	surface: z.enum(['PRODUCT', 'CATEGORY', 'HOME', 'CART']).optional().default('PRODUCT'),
	productSlug: z.string().min(1).optional(),
	categorySlug: z.string().min(1).optional(),
})

const quoteBodySchema = z.object({
	store: z.string().min(1).optional(),
	items: z
		.array(
			z.object({
				variantId: z.string().min(1),
				quantity: z.number().int().positive(),
			}),
		)
		.default([]),
	channel: z.enum(['ECOMMERCE', 'PDV']).optional().default('ECOMMERCE'),
	couponCode: z.string().trim().min(1).nullish(),
	deliveryOptionId: z.string().min(1).nullish(),
	shippingBaseCents: z.number().int().min(0).nullish(),
})

type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>
type QuoteBody = z.infer<typeof quoteBodySchema>

@AllowAnonymous()
@Controller('/api/v1/storefront/promotions')
export class StorefrontPromotionsController {
	constructor(
		private readonly discoverPromotions: DiscoverPromotionsUseCase,
		private readonly quotePromotions: QuotePromotionsUseCase,
	) {}

	@Get('/discovery')
	async discovery(@Query(new ZodValidationPipe(discoveryQuerySchema)) query: DiscoveryQuery) {
		try {
			return await this.discoverPromotions.execute({
				storeSlug: query.store,
				surface: query.surface,
				productSlug: query.productSlug,
				categorySlug: query.categorySlug,
			})
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/quote')
	@HttpCode(200)
	async quote(@Body(new ZodValidationPipe(quoteBodySchema)) body: QuoteBody) {
		try {
			return await this.quotePromotions.execute({
				storeSlug: body.store,
				items: body.items,
				channel: body.channel === 'PDV' ? PromotionChannel.PDV : PromotionChannel.ECOMMERCE,
				couponCode: body.couponCode ?? null,
				deliveryOptionId: body.deliveryOptionId ?? null,
				shippingBaseCents: body.shippingBaseCents ?? null,
			})
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}
}
