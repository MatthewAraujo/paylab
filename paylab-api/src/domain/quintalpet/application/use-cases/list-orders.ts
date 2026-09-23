import {
	ListOrdersByStoreFilters,
	OrdersRepository,
	PaginatedOrders,
} from '@/domain/quintalpet/application/repositories/orders-repository'
import { Injectable } from '@nestjs/common'

@Injectable()
export class ListOrdersUseCase {
	constructor(private readonly ordersRepository: OrdersRepository) {}

	execute(storeId: string, filters: ListOrdersByStoreFilters): Promise<PaginatedOrders> {
		return this.ordersRepository.listByStore(storeId, filters)
	}
}
