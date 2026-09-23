import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

@Injectable()
export class TransitionOrderStatusUseCase {
	constructor(private readonly ordersRepository: OrdersRepository) {}

	async execute(orderId: string, storeId: string, next: OrderStatus): Promise<Order> {
		if (next === OrderStatus.CANCELLED) {
			throw new BadRequestException('Use the cancel endpoint to cancel an order.')
		}

		const order = await this.ordersRepository.findById(orderId, storeId)
		if (!order) throw new NotFoundException('Order not found.')

		order.transitionTo(next) // throws InvalidOrderTransitionError on an illegal move
		await this.ordersRepository.save(order)
		return order
	}
}
