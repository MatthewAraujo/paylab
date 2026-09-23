import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { PrismaInventoryMovementMapper } from '@/infra/database/prisma/mappers/prisma-inventory-movement-mapper'
import { Prisma } from '@prisma/client'

export type PrismaInventoryItemAggregate = Prisma.InventoryItemGetPayload<{
	include: {
		movements: {
			orderBy: { createdAt: 'asc' }
		}
	}
}>

export class PrismaInventoryItemMapper {
	static toDomain(raw: PrismaInventoryItemAggregate) {
		return InventoryItem.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				variantId: new UniqueEntityID(raw.variantId),
				availableQuantity: raw.availableQuantity,
				movements: raw.movements.map(PrismaInventoryMovementMapper.toDomain),
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(item: InventoryItem): Prisma.InventoryItemUncheckedCreateInput {
		return {
			id: item.id.toString(),
			storeId: item.storeId.toString(),
			variantId: item.variantId.toString(),
			availableQuantity: item.availableQuantity,
			createdAt: item.createdAt,
			updatedAt: item.updatedAt ?? undefined,
		}
	}
}
