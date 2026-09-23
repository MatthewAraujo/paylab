import {
	ListOrdersByStoreFilters,
	OrdersRepository,
	PaginatedOrders,
} from '@/domain/quintalpet/application/repositories/orders-repository'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import {
	PrismaOrderAggregate,
	PrismaOrderItemMapper,
	PrismaOrderMapper,
} from '@/infra/database/prisma/mappers/prisma-order-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const orderInclude = {
	items: true,
}

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(orderId: string, storeId: string): Promise<Order | null> {
		const record = await this.prisma.order.findFirst({
			where: { id: orderId, storeId },
			include: orderInclude,
		})

		return record ? PrismaOrderMapper.toDomain(record as PrismaOrderAggregate) : null
	}

	async listByStore(storeId: string, filters: ListOrdersByStoreFilters): Promise<PaginatedOrders> {
		const where: Prisma.OrderWhereInput = {
			storeId,
			...(filters.storeCustomerId ? { storeCustomerId: filters.storeCustomerId } : {}),
			...(filters.status ? { status: filters.status } : {}),
			...(filters.createdFrom || filters.createdTo
				? { createdAt: { gte: filters.createdFrom, lte: filters.createdTo } }
				: {}),
		}

		const [records, total] = await Promise.all([
			this.prisma.order.findMany({
				where,
				include: orderInclude,
				skip: (filters.page - 1) * filters.perPage,
				take: filters.perPage,
				orderBy: { createdAt: 'desc' },
			}),
			this.prisma.order.count({ where }),
		])

		return {
			items: records.map((record) => PrismaOrderMapper.toDomain(record as PrismaOrderAggregate)),
			total,
		}
	}

	async save(order: Order, tx?: Prisma.TransactionClient): Promise<void> {
		const client = tx ?? this.prisma
		const data = PrismaOrderMapper.toPrisma(order)

		await client.order.upsert({
			where: { id: order.id.toString() },
			create: {
				...data,
				items: { create: order.items.map(PrismaOrderItemMapper.toPrisma) },
			},
			update: {
				status: order.status,
				cancelledAt: order.cancelledAt,
				updatedAt: order.updatedAt ?? undefined,
				// items are intentionally never part of the update payload —
				// T2's invariant is that OrderItem rows never change after creation.
			},
		})
	}
}
