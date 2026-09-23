import { Prisma } from '@prisma/client'
import { InventoryItem } from '../../enterprise/entities/inventory-item'
import { InventoryMovement } from '../../enterprise/entities/inventory-movement'

export abstract class InventoryItemsRepository {
	abstract findByVariantId(variantId: string, storeId: string): Promise<InventoryItem | null>
	abstract save(
		item: InventoryItem,
		movement: InventoryMovement,
		tx?: Prisma.TransactionClient,
	): Promise<void>
}
