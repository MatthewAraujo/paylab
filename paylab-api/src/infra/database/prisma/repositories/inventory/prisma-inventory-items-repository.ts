import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { InventoryMovement } from '@/domain/quintalpet/enterprise/entities/inventory-movement'
import {
	PrismaInventoryItemAggregate,
	PrismaInventoryItemMapper,
} from '@/infra/database/prisma/mappers/prisma-inventory-item-mapper'
import { PrismaInventoryMovementMapper } from '@/infra/database/prisma/mappers/prisma-inventory-movement-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const inventoryAggregateInclude = {
	movements: {
		orderBy: { createdAt: 'asc' as const },
	},
}

@Injectable()
export class PrismaInventoryItemsRepository implements InventoryItemsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findByVariantId(variantId: string, storeId: string): Promise<InventoryItem | null> {
		const item = await this.prisma.inventoryItem.findFirst({
			where: {
				variantId,
				storeId: storeId,
			},
			include: inventoryAggregateInclude,
		})

		return item ? PrismaInventoryItemMapper.toDomain(item as PrismaInventoryItemAggregate) : null
	}

	async save(
		item: InventoryItem,
		movement: InventoryMovement,
		tx?: Prisma.TransactionClient,
	): Promise<void> {
		const itemData = PrismaInventoryItemMapper.toPrisma(item)

		const run = async (executor: Prisma.TransactionClient | PrismaService) => {
			await executor.inventoryItem.upsert({
				where: { id: item.id.toString() },
				create: itemData,
				update: {
					availableQuantity: item.availableQuantity,
					updatedAt: item.updatedAt ?? undefined,
				},
			})

			await executor.inventoryMovement.create({
				data: PrismaInventoryMovementMapper.toPrisma(movement, {
					inventoryItemId: item.id.toString(),
				}),
			})
		}

		if (tx) {
			await run(tx)
		} else {
			await this.prisma.$transaction((innerTx) => run(innerTx))
		}
	}
}
