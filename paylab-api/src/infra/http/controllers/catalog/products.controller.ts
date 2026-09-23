import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { AppLogger } from '@/infra/observability/app-logger'
import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger'
import {
	AttachProductImagesBody,
	CreateProductBody,
	CreateVariantBody,
	PublishProductsBody,
	ReorderProductImagesBody,
	UpdateProductBody,
	UpdateVariantBody,
	attachProductImagesBodySchema,
	createProductBodySchema,
	createVariantBodySchema,
	presentProduct,
	presentVariant,
	publishProductsBodySchema,
	reorderProductImagesBodySchema,
	updateProductBodySchema,
	updateVariantBodySchema,
} from './catalog-admin.http'

@Controller('/api/v1/admin/catalog/products')
@StoreMemberOnly()
export class ProductsController {
	constructor(
		private readonly catalogAdminService: ManageCatalogUseCase,
		private readonly logger: AppLogger,
	) {}

	@Post()
	@HttpCode(201)
	async create(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(createProductBodySchema)) body: CreateProductBody,
	) {
		try {
			const product = await this.catalogAdminService.createProduct({
				storeId,
				...body,
			})

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	// Static `/publish` is declared before the parameterised `:productId/*`
	// routes so Nest's router matches the literal segment (see PRD-BULK-DRAFT-PUBLISH).
	@Post('/publish')
	@HttpCode(200)
	@ApiOperation({
		summary: 'Bulk-publish draft products',
		description:
			'Best-effort promotion of every eligible DRAFT product in the list to ACTIVE. ' +
			'Ineligible ids are reported under `skipped` and never abort the batch.',
	})
	@ApiOkResponse({
		description: 'Summary of published and skipped ids.',
		schema: {
			example: {
				published: [{ id: '3f9a1c2e-1b2c-4d5e-8f90-1a2b3c4d5e6f', status: 'ACTIVE' }],
				skipped: [
					{
						id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
						name: 'Ração Premium Cães',
						reason: 'not_draft',
						currentStatus: 'ACTIVE',
					},
					{
						id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
						name: null,
						reason: 'not_found',
					},
				],
			},
		},
	})
	@ApiBadRequestResponse({
		description: 'Empty list, more than 200 ids, or a non-UUID id.',
	})
	async publishMany(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(publishProductsBodySchema)) body: PublishProductsBody,
	) {
		try {
			const result = await this.catalogAdminService.publishProducts(storeId, body.productIds)

			this.logger.info('catalog.products.bulk_publish', {
				context: 'ProductsController',
				storeId,
				requested: body.productIds.length,
				published: result.published.length,
				skipped: result.skipped.length,
			})

			return result
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get()
	async list(@CurrentStoreId() storeId: string) {
		const items = await this.catalogAdminService.listProducts(storeId)
		return { items: items.map(presentProduct) }
	}

	@Get('/:productId')
	async get(@CurrentStoreId() storeId: string, @UuidParam('productId') productId: string) {
		try {
			const product = await this.catalogAdminService.getProduct(storeId, productId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Patch('/:productId')
	async update(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@Body(new ZodValidationPipe(updateProductBodySchema)) body: UpdateProductBody,
	) {
		try {
			const product = await this.catalogAdminService.updateProduct(storeId, productId, body)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/variants')
	@HttpCode(201)
	async createVariant(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@Body(new ZodValidationPipe(createVariantBodySchema)) body: CreateVariantBody,
	) {
		try {
			const variant = await this.catalogAdminService.addVariant(storeId, productId, body)

			return presentVariant(variant)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Patch('/:productId/variants/:variantId')
	async updateVariant(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@UuidParam('variantId') variantId: string,
		@Body(new ZodValidationPipe(updateVariantBodySchema)) body: UpdateVariantBody,
	) {
		try {
			const variant = await this.catalogAdminService.updateVariant(
				storeId,
				productId,
				variantId,
				body,
			)

			return presentVariant(variant)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/variants/:variantId/deactivate')
	@HttpCode(200)
	async deactivateVariant(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@UuidParam('variantId') variantId: string,
	) {
		try {
			const variant = await this.catalogAdminService.deactivateVariant(
				storeId,
				productId,
				variantId,
			)

			return presentVariant(variant)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/images')
	@HttpCode(201)
	async attachImages(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@Body(new ZodValidationPipe(attachProductImagesBodySchema)) body: AttachProductImagesBody,
	) {
		try {
			const product = await this.catalogAdminService.attachProductImages(storeId, productId, body)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Put('/:productId/images/order')
	async reorderImages(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@Body(new ZodValidationPipe(reorderProductImagesBodySchema)) body: ReorderProductImagesBody,
	) {
		try {
			const product = await this.catalogAdminService.reorderProductImages(storeId, productId, body)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Delete('/:productId/images/:imageId')
	async removeImage(
		@CurrentStoreId() storeId: string,
		@UuidParam('productId') productId: string,
		@UuidParam('imageId') imageId: string,
	) {
		try {
			const product = await this.catalogAdminService.removeProductImage(storeId, productId, imageId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/publish')
	@HttpCode(200)
	async publish(@CurrentStoreId() storeId: string, @UuidParam('productId') productId: string) {
		try {
			const product = await this.catalogAdminService.publishProduct(storeId, productId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/deactivate')
	@HttpCode(200)
	async deactivate(@CurrentStoreId() storeId: string, @UuidParam('productId') productId: string) {
		try {
			const product = await this.catalogAdminService.deactivateProduct(storeId, productId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/reactivate')
	@HttpCode(200)
	async reactivate(@CurrentStoreId() storeId: string, @UuidParam('productId') productId: string) {
		try {
			const product = await this.catalogAdminService.reactivateProduct(storeId, productId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/archive')
	@HttpCode(200)
	async archive(@CurrentStoreId() storeId: string, @UuidParam('productId') productId: string) {
		try {
			const product = await this.catalogAdminService.archiveProduct(storeId, productId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:productId/restore')
	@HttpCode(200)
	async restore(@CurrentStoreId() storeId: string, @UuidParam('productId') productId: string) {
		try {
			const product = await this.catalogAdminService.restoreProduct(storeId, productId)

			return presentProduct(product)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}
}
