import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryMovement } from '@/domain/quintalpet/enterprise/entities/inventory-movement'
import { InventoryMovementType } from '@/domain/quintalpet/enterprise/types/inventory-movement-type'
import { Prisma, InventoryMovement as PrismaInventoryMovement } from '@prisma/client'

export class PrismaInventoryMovementMapper {
	static toDomain(raw: PrismaInventoryMovement) {
		return InventoryMovement.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				variantId: new UniqueEntityID(raw.variantId),
				type: raw.type as InventoryMovementType,
				quantityDelta: raw.quantityDelta,
				balanceAfter: raw.balanceAfter,
				note: raw.note,
				createdAt: raw.createdAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(
		movement: InventoryMovement,
		input: { inventoryItemId: string },
	): Prisma.InventoryMovementUncheckedCreateInput {
		return {
			id: movement.id.toString(),
			storeId: movement.storeId.toString(),
			inventoryItemId: input.inventoryItemId,
			variantId: movement.variantId.toString(),
			type: movement.type,
			quantityDelta: movement.quantityDelta,
			balanceAfter: movement.balanceAfter,
			note: movement.note ?? undefined,
			createdAt: movement.createdAt,
		}
	}
}
