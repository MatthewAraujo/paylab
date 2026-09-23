import { Prisma } from '@prisma/client'
import { Order } from '../../enterprise/entities/order'
import { OrderStatus } from '../../enterprise/types/order-status'

export interface ListOrdersByStoreFilters {
	storeCustomerId?: string
	status?: OrderStatus
	createdFrom?: Date
	createdTo?: Date
	page: number
	perPage: number
}

export interface PaginatedOrders {
	items: Order[]
	total: number
}

export abstract class OrdersRepository {
	abstract findById(orderId: string, storeId: string): Promise<Order | null>
	abstract listByStore(storeId: string, filters: ListOrdersByStoreFilters): Promise<PaginatedOrders>
	abstract save(order: Order, tx?: Prisma.TransactionClient): Promise<void>
}
