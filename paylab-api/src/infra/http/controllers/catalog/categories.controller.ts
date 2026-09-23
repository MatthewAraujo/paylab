import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common'
import {
	CreateCategoryBody,
	UpdateCategoryBody,
	createCategoryBodySchema,
	presentCategory,
	updateCategoryBodySchema,
} from './catalog-admin.http'

@Controller('/api/v1/admin/catalog/categories')
@StoreMemberOnly()
export class CategoriesController {
	constructor(private readonly catalogAdminService: ManageCatalogUseCase) {}

	@Post()
	@HttpCode(201)
	async create(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(createCategoryBodySchema)) body: CreateCategoryBody,
	) {
		try {
			const category = await this.catalogAdminService.createCategory({
				storeId,
				...body,
			})

			return presentCategory(category)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get()
	async list(@CurrentStoreId() storeId: string) {
		const items = await this.catalogAdminService.listCategories(storeId)
		return { items: items.map(presentCategory) }
	}

	@Patch('/:categoryId')
	async update(
		@CurrentStoreId() storeId: string,
		@UuidParam('categoryId') categoryId: string,
		@Body(new ZodValidationPipe(updateCategoryBodySchema)) body: UpdateCategoryBody,
	) {
		try {
			const category = await this.catalogAdminService.updateCategory(storeId, categoryId, body)

			return presentCategory(category)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:categoryId/deactivate')
	@HttpCode(200)
	async deactivate(@CurrentStoreId() storeId: string, @UuidParam('categoryId') categoryId: string) {
		try {
			const category = await this.catalogAdminService.deactivateCategory(storeId, categoryId)

			return presentCategory(category)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:categoryId/activate')
	@HttpCode(200)
	async activate(@CurrentStoreId() storeId: string, @UuidParam('categoryId') categoryId: string) {
		try {
			const category = await this.catalogAdminService.activateCategory(storeId, categoryId)

			return presentCategory(category)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:categoryId/archive')
	@HttpCode(200)
	async archive(@CurrentStoreId() storeId: string, @UuidParam('categoryId') categoryId: string) {
		try {
			const category = await this.catalogAdminService.archiveCategory(storeId, categoryId)

			return presentCategory(category)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}
}
