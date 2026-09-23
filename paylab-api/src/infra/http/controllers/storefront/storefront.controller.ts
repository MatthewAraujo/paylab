import { QueryStorefrontUseCase } from '@/domain/quintalpet/application/use-cases/query-storefront'
import { QuoteDeliveryOptionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-delivery-options'
import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	Param,
	Post,
	Query,
	ServiceUnavailableException,
} from '@nestjs/common'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

const storefrontStoreQuerySchema = z.object({
	store: z.string().min(1).optional(),
})

const storefrontProductsQuerySchema = storefrontStoreQuerySchema.extend({
	category: z.string().min(1).optional(),
	brand: z.string().min(1).optional(),
	page: z.coerce.number().int().min(1).optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(24),
})

const storefrontSearchQuerySchema = storefrontProductsQuerySchema.extend({
	q: z.string().min(1),
})

const shippingQuoteBodySchema = z.object({
	store: z.string().min(1).optional(),
	postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'postalCode must be a valid Brazilian CEP'),
})

type StorefrontStoreQuery = z.infer<typeof storefrontStoreQuerySchema>
type StorefrontProductsQuery = z.infer<typeof storefrontProductsQuerySchema>
type StorefrontSearchQuery = z.infer<typeof storefrontSearchQuerySchema>
type ShippingQuoteBody = z.infer<typeof shippingQuoteBodySchema>

@AllowAnonymous()
@Controller('/api/v1/storefront')
export class StorefrontController {
	constructor(
		private readonly storefrontQueryService: QueryStorefrontUseCase,
		private readonly quoteDeliveryOptions: QuoteDeliveryOptionsUseCase,
	) {}

	@Post('/shipping/quote')
	@HttpCode(200)
	async quoteShipping(
		@Query(new ZodValidationPipe(storefrontStoreQuerySchema)) query: StorefrontStoreQuery,
		@Body(new ZodValidationPipe(shippingQuoteBodySchema)) body: ShippingQuoteBody,
	) {
		try {
			return await this.quoteDeliveryOptions.execute({
				storeSlug: body.store ?? query.store,
				postalCode: body.postalCode,
			})
		} catch (error) {
			if (error instanceof GeocoderUnavailableError) {
				throw new ServiceUnavailableException({
					code: 'SHIPPING_QUOTE_UNAVAILABLE',
					message: 'Não foi possível calcular o frete agora. Tente novamente.',
				})
			}
			throwTranslatedDomainError(error)
		}
	}

	@Get('/home')
	async getHome(
		@Query(new ZodValidationPipe(storefrontStoreQuerySchema)) query: StorefrontStoreQuery,
	) {
		return this.storefrontQueryService.getHome(query.store)
	}

	@Get('/products')
	async listProducts(
		@Query(new ZodValidationPipe(storefrontProductsQuerySchema))
		query: StorefrontProductsQuery,
	) {
		return this.storefrontQueryService.listProducts({
			storeSlug: query.store,
			categorySlug: query.category,
			brandSlug: query.brand,
			page: query.page,
			limit: query.limit,
		})
	}

	@Get('/products/:slug')
	async getProductBySlug(
		@Param('slug') slug: string,
		@Query(new ZodValidationPipe(storefrontStoreQuerySchema)) query: StorefrontStoreQuery,
	) {
		return this.storefrontQueryService.getProductBySlug(slug, query.store)
	}

	@Get('/search')
	async searchCatalog(
		@Query(new ZodValidationPipe(storefrontSearchQuerySchema))
		query: StorefrontSearchQuery,
	) {
		return this.storefrontQueryService.searchCatalog({
			storeSlug: query.store,
			categorySlug: query.category,
			brandSlug: query.brand,
			searchTerm: query.q,
			page: query.page,
			limit: query.limit,
		})
	}

	@Get('/categories')
	async listCategories(
		@Query(new ZodValidationPipe(storefrontStoreQuerySchema)) query: StorefrontStoreQuery,
	) {
		return this.storefrontQueryService.listCategories(query.store)
	}

	@Get('/categories/:slug')
	async getCategoryBySlug(
		@Param('slug') slug: string,
		@Query(new ZodValidationPipe(storefrontStoreQuerySchema)) query: StorefrontStoreQuery,
	) {
		return this.storefrontQueryService.getCategoryBySlug(slug, query.store)
	}

	@Get('/brands')
	async listBrands(
		@Query(new ZodValidationPipe(storefrontStoreQuerySchema)) query: StorefrontStoreQuery,
	) {
		return this.storefrontQueryService.listBrands(query.store)
	}
}
