import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { OrderPlacementConflictError } from './errors/order-placement-conflict-error'

@Injectable()
export class CancelOrderUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly ordersRepository: OrdersRepository,
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly inventoryItemsRepository: InventoryItemsRepository,
	) {}

	async execute(orderId: string, storeId: string): Promise<Order> {
		const order = await this.ordersRepository.findById(orderId, storeId)
		if (!order) throw new NotFoundException('Order not found.')

		// A guest walk-in order has no storeCustomerId, and therefore no
		// customer stats to reverse — only look one up (and require it) when
		// the order actually has a registered customer attached.
		const storeCustomer = order.storeCustomerId
			? await this.storeCustomersRepository.findById(order.storeCustomerId.toString(), storeId)
			: null
		if (order.storeCustomerId && !storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		order.transitionTo(OrderStatus.CANCELLED) // throws InvalidOrderTransitionError if terminal

		try {
			await this.prisma.$transaction(
				async (tx) => {
					await this.ordersRepository.save(order, tx)

					for (const item of order.items) {
						const inventoryItem = await this.inventoryItemsRepository.findByVariantId(
							item.variantId.toString(),
							storeId,
						)
						if (!inventoryItem) continue // defensive: should always exist post-placement
						const movement = inventoryItem.returnStock(
							item.quantity,
							`Cancel order ${order.orderCode}`,
						)
						await this.inventoryItemsRepository.save(inventoryItem, movement, tx)
					}

					if (storeCustomer) {
						storeCustomer.reverseOrder(order.totalCents)
						await this.storeCustomersRepository.save(storeCustomer, tx)
					}
				},
				{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
			)
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
				throw new OrderPlacementConflictError() // reused: "please retry" is accurate here too
			}
			throw error
		}

		return order
	}
}
