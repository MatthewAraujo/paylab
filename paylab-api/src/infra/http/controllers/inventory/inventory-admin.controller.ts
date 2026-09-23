import { ManageInventoryUseCase } from '@/domain/quintalpet/application/use-cases/manage-inventory'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { InventoryMovement } from '@/domain/quintalpet/enterprise/entities/inventory-movement'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { z } from 'zod'

const quantityBodySchema = z.object({
	quantity: z.number().int(),
	note: z.string().optional().nullable(),
})

const adjustmentBodySchema = z.object({
	quantityDelta: z.number().int(),
	note: z.string().optional().nullable(),
})

type QuantityBody = z.infer<typeof quantityBodySchema>
type AdjustmentBody = z.infer<typeof adjustmentBodySchema>

function presentInventoryItem(
	item:
		| InventoryItem
		| {
				id: string | null
				variantId: string
				availableQuantity: number
				createdAt: Date | null
				updatedAt: Date | null
		  },
	variant: { id: string; sku: string; name: string },
) {
	const createdAt = item.createdAt ? item.createdAt.toISOString() : null

	return {
		id: item.id ? item.id.toString() : null,
		variantId: variant.id,
		variantSku: variant.sku,
		variantName: variant.name,
		availableQuantity: item.availableQuantity,
		createdAt,
		updatedAt: item.updatedAt ? item.updatedAt.toISOString() : createdAt,
	}
}

function presentMovement(movement: InventoryMovement | { [key: string]: any }) {
	return {
		id: movement.id.toString(),
		variantId: movement.variantId.toString(),
		type: movement.type,
		quantityDelta: movement.quantityDelta,
		balanceAfter: movement.balanceAfter,
		note: movement.note ?? null,
		createdAt: movement.createdAt.toISOString(),
	}
}

@Controller('/api/v1/admin/inventory')
@StoreMemberOnly()
export class InventoryAdminController {
	constructor(private readonly inventoryAdminService: ManageInventoryUseCase) {}

	@Post('/variants/:variantId/receive')
	@HttpCode(201)
	async receiveStock(
		@CurrentStoreId() storeId: string,
		@UuidParam('variantId') variantId: string,
		@Body(new ZodValidationPipe(quantityBodySchema)) body: QuantityBody,
	) {
		try {
			const result = await this.inventoryAdminService.receiveStock(
				storeId,
				variantId,
				body.quantity,
				body.note,
			)

			return {
				item: presentInventoryItem(result.item, result.variant),
				movement: presentMovement(result.movement),
			}
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/variants/:variantId/remove')
	@HttpCode(201)
	async removeStock(
		@CurrentStoreId() storeId: string,
		@UuidParam('variantId') variantId: string,
		@Body(new ZodValidationPipe(quantityBodySchema)) body: QuantityBody,
	) {
		try {
			const result = await this.inventoryAdminService.removeStock(
				storeId,
				variantId,
				body.quantity,
				body.note,
			)

			return {
				item: presentInventoryItem(result.item, result.variant),
				movement: presentMovement(result.movement),
			}
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/variants/:variantId/adjust')
	@HttpCode(201)
	async adjustStock(
		@CurrentStoreId() storeId: string,
		@UuidParam('variantId') variantId: string,
		@Body(new ZodValidationPipe(adjustmentBodySchema)) body: AdjustmentBody,
	) {
		try {
			const result = await this.inventoryAdminService.adjustStock(
				storeId,
				variantId,
				body.quantityDelta,
				body.note,
			)

			return {
				item: presentInventoryItem(result.item, result.variant),
				movement: presentMovement(result.movement),
			}
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/variants/:variantId/return')
	@HttpCode(201)
	async returnStock(
		@CurrentStoreId() storeId: string,
		@UuidParam('variantId') variantId: string,
		@Body(new ZodValidationPipe(quantityBodySchema)) body: QuantityBody,
	) {
		try {
			const result = await this.inventoryAdminService.returnStock(
				storeId,
				variantId,
				body.quantity,
				body.note,
			)

			return {
				item: presentInventoryItem(result.item, result.variant),
				movement: presentMovement(result.movement),
			}
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get('/items')
	async listStockItems(@CurrentStoreId() storeId: string) {
		const items = await this.inventoryAdminService.listStockItems(storeId)

		return {
			items: items.map((item) => presentInventoryItem(item, item.variant)),
		}
	}

	@Get('/variants/:variantId')
	async getStockForVariant(
		@CurrentStoreId() storeId: string,
		@UuidParam('variantId') variantId: string,
	) {
		const result = await this.inventoryAdminService.getStockForVariant(storeId, variantId)

		return presentInventoryItem(
			result.item ?? {
				id: null,
				variantId: result.variant.id,
				availableQuantity: 0,
				createdAt: null,
				updatedAt: null,
			},
			result.variant,
		)
	}

	@Get('/variants/:variantId/movements')
	async listMovementHistory(
		@CurrentStoreId() storeId: string,
		@UuidParam('variantId') variantId: string,
	) {
		const items = await this.inventoryAdminService.listMovementHistory(storeId, variantId)

		return {
			items: items.map(presentMovement),
		}
	}
}
