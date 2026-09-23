import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { InvalidInventoryQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-inventory-quantity-error'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'

type InventoryVariantSummary = {
	id: string
	sku: string
	name: string
}

@Injectable()
export class ManageInventoryUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly inventoryItemsRepository: InventoryItemsRepository,
	) {}

	async receiveStock(storeId: string, variantId: string, quantity: number, note?: string | null) {
		const variant = await this.getVariantOrFail(variantId, storeId)
		const item = await this.getOrCreateInventoryItem(storeId, variantId)
		const movement = item.receive(quantity, note)

		await this.inventoryItemsRepository.save(item, movement)

		return { variant, item, movement }
	}

	async removeStock(storeId: string, variantId: string, quantity: number, note?: string | null) {
		const variant = await this.getVariantOrFail(variantId, storeId)
		const item = await this.getOrCreateInventoryItem(storeId, variantId)
		const movement = item.remove(quantity, note)

		await this.inventoryItemsRepository.save(item, movement)

		return { variant, item, movement }
	}

	async adjustStock(
		storeId: string,
		variantId: string,
		quantityDelta: number,
		note?: string | null,
	) {
		const variant = await this.getVariantOrFail(variantId, storeId)
		const item = await this.getOrCreateInventoryItem(storeId, variantId)
		const movement = item.adjust(quantityDelta, note)

		await this.inventoryItemsRepository.save(item, movement)

		return { variant, item, movement }
	}

	async returnStock(storeId: string, variantId: string, quantity: number, note?: string | null) {
		const variant = await this.getVariantOrFail(variantId, storeId)
		const item = await this.getOrCreateInventoryItem(storeId, variantId)
		const movement = item.returnStock(quantity, note)

		await this.inventoryItemsRepository.save(item, movement)

		return { variant, item, movement }
	}

	async listStockItems(storeId: string) {
		// Every store variant is listed here, not just ones with a persisted
		// InventoryItem row — that row is only created lazily on the first
		// stock movement (see `getOrCreateInventoryItem`), so a variant just
		// created via the catalog admin has none yet. Variants without one
		// get a synthetic zero-stock entry, the same shape `getStockForVariant`
		// already returns for a single variant with no inventory history.
		const variants = await this.prisma.productVariant.findMany({
			where: { storeId: storeId },
			include: { inventoryItem: true },
			orderBy: [{ createdAt: 'asc' }],
		})

		return variants.map((variant) => ({
			id: variant.inventoryItem?.id ?? null,
			variantId: variant.id,
			availableQuantity: variant.inventoryItem?.availableQuantity ?? 0,
			createdAt: variant.inventoryItem?.createdAt ?? null,
			updatedAt: variant.inventoryItem?.updatedAt ?? null,
			variant: {
				id: variant.id,
				sku: variant.sku,
				name: variant.name,
			},
		}))
	}

	async getStockForVariant(storeId: string, variantId: string) {
		const variant = await this.getVariantOrFail(variantId, storeId)
		const item = await this.prisma.inventoryItem.findFirst({
			where: {
				storeId: storeId,
				variantId,
			},
		})

		return {
			variant,
			item,
		}
	}

	async listMovementHistory(storeId: string, variantId: string) {
		await this.getVariantOrFail(variantId, storeId)

		return this.prisma.inventoryMovement.findMany({
			where: {
				storeId: storeId,
				variantId,
			},
			orderBy: [{ createdAt: 'asc' }],
		})
	}

	private async getOrCreateInventoryItem(storeId: string, variantId: string) {
		const existing = await this.inventoryItemsRepository.findByVariantId(variantId, storeId)

		if (existing) {
			return existing
		}

		return InventoryItem.create({
			storeId: new UniqueEntityID(storeId),
			variantId: new UniqueEntityID(variantId),
		})
	}

	private async getVariantOrFail(
		variantId: string,
		storeId: string,
	): Promise<InventoryVariantSummary> {
		const variant = await this.prisma.productVariant.findFirst({
			where: {
				id: variantId,
				storeId: storeId,
			},
			select: {
				id: true,
				sku: true,
				name: true,
			},
		})

		if (!variant) {
			throw new NotFoundException('Inventory variant not found.')
		}

		return variant
	}
}

export function isInventoryDomainError(error: unknown) {
	return (
		error instanceof InvalidInventoryQuantityError || error instanceof NegativeInventoryBalanceError
	)
}
