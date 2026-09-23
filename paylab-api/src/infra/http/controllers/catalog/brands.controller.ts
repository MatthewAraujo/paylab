import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common'
import {
	CreateBrandBody,
	UpdateBrandBody,
	createBrandBodySchema,
	presentBrand,
	updateBrandBodySchema,
} from './catalog-admin.http'

@Controller('/api/v1/admin/catalog/brands')
@StoreMemberOnly()
export class BrandsController {
	constructor(private readonly catalogAdminService: ManageCatalogUseCase) {}

	@Post()
	@HttpCode(201)
	async create(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(createBrandBodySchema)) body: CreateBrandBody,
	) {
		try {
			const brand = await this.catalogAdminService.createBrand({
				storeId,
				...body,
			})

			return presentBrand(brand)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get()
	async list(@CurrentStoreId() storeId: string) {
		const items = await this.catalogAdminService.listBrands(storeId)
		return { items: items.map(presentBrand) }
	}

	@Patch('/:brandId')
	async update(
		@CurrentStoreId() storeId: string,
		@UuidParam('brandId') brandId: string,
		@Body(new ZodValidationPipe(updateBrandBodySchema)) body: UpdateBrandBody,
	) {
		try {
			const brand = await this.catalogAdminService.updateBrand(storeId, brandId, body)

			return presentBrand(brand)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:brandId/deactivate')
	@HttpCode(200)
	async deactivate(@CurrentStoreId() storeId: string, @UuidParam('brandId') brandId: string) {
		try {
			const brand = await this.catalogAdminService.deactivateBrand(storeId, brandId)

			return presentBrand(brand)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:brandId/activate')
	@HttpCode(200)
	async activate(@CurrentStoreId() storeId: string, @UuidParam('brandId') brandId: string) {
		try {
			const brand = await this.catalogAdminService.activateBrand(storeId, brandId)

			return presentBrand(brand)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:brandId/archive')
	@HttpCode(200)
	async archive(@CurrentStoreId() storeId: string, @UuidParam('brandId') brandId: string) {
		try {
			const brand = await this.catalogAdminService.archiveBrand(storeId, brandId)

			return presentBrand(brand)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}
}
