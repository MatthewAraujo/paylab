import { ManageMerchandisingUseCase } from '@/domain/quintalpet/application/use-cases/manage-merchandising'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common'
import { z } from 'zod'

const replaceFeaturedCategoriesBodySchema = z.object({
	featuredCategoryIds: z.array(z.string().uuid()),
})

const replaceFeaturedProductsBodySchema = z.object({
	featuredProductIds: z.array(z.string().uuid()),
})

type ReplaceFeaturedCategoriesBody = z.infer<typeof replaceFeaturedCategoriesBodySchema>
type ReplaceFeaturedProductsBody = z.infer<typeof replaceFeaturedProductsBodySchema>

@Controller('/api/v1/admin/merchandising')
@StoreMemberOnly()
export class MerchandisingAdminController {
	constructor(private readonly merchandisingAdminService: ManageMerchandisingUseCase) {}

	@Put('/home/featured-categories')
	@HttpCode(200)
	async replaceFeaturedCategories(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(replaceFeaturedCategoriesBodySchema))
		body: ReplaceFeaturedCategoriesBody,
	) {
		try {
			return await this.merchandisingAdminService.replaceFeaturedCategories({
				storeId,
				featuredCategoryIds: body.featuredCategoryIds,
			})
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Put('/home/featured-products')
	@HttpCode(200)
	async replaceFeaturedProducts(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(replaceFeaturedProductsBodySchema))
		body: ReplaceFeaturedProductsBody,
	) {
		try {
			return await this.merchandisingAdminService.replaceFeaturedProducts({
				storeId,
				featuredProductIds: body.featuredProductIds,
			})
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get('/home')
	async getHomeConfiguration(@CurrentStoreId() storeId: string) {
		return this.merchandisingAdminService.getHomeConfiguration(storeId)
	}
}
