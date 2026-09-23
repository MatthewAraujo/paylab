import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import { Injectable, NotFoundException } from '@nestjs/common'

@Injectable()
export class GetOrderUseCase {
	constructor(private readonly ordersRepository: OrdersRepository) {}

	async execute(orderId: string, storeId: string): Promise<Order> {
		const order = await this.ordersRepository.findById(orderId, storeId)
		if (!order) throw new NotFoundException('Order not found.')
		return order
	}
}
