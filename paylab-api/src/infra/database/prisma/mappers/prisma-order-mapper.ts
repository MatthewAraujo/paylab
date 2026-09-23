import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
	Order,
	OrderAppliedPromotion,
	OrderShippingAddressSnapshot,
} from '@/domain/quintalpet/enterprise/entities/order'
import { OrderItem } from '@/domain/quintalpet/enterprise/entities/order-item'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { Prisma } from '@prisma/client'

export type PrismaOrderAggregate = Prisma.OrderGetPayload<{
	include: { items: true }
}>

type PrismaOrderItemRecord = Prisma.OrderItemGetPayload<Record<string, never>>

export class PrismaOrderItemMapper {
	static toDomain(raw: PrismaOrderItemRecord): OrderItem {
		// Legacy rows created before the promotion snapshot columns default their
		// base* fields to 0; treat that as "no allocation persisted" and let the
		// entity derive a no-promotion line.
		const hasAllocation = raw.baseUnitPriceCents > 0 || raw.baseLineTotalCents > 0

		return OrderItem.create(
			{
				orderId: new UniqueEntityID(raw.orderId),
				productId: new UniqueEntityID(raw.productId),
				variantId: new UniqueEntityID(raw.variantId),
				productName: raw.productName,
				variantLabel: raw.variantLabel,
				sku: raw.sku,
				unitPriceCents: raw.unitPriceCents,
				quantity: raw.quantity,
				lineTotalCents: raw.lineTotalCents,
				baseUnitPriceCents: hasAllocation ? raw.baseUnitPriceCents : undefined,
				unitDiscountCents: hasAllocation ? raw.unitDiscountCents : undefined,
				baseLineTotalCents: hasAllocation ? raw.baseLineTotalCents : undefined,
				lineDiscountCents: hasAllocation ? raw.lineDiscountCents : undefined,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(item: OrderItem): Prisma.OrderItemUncheckedCreateWithoutOrderInput {
		return {
			id: item.id.toString(),
			productId: item.productId.toString(),
			variantId: item.variantId.toString(),
			productName: item.productName,
			variantLabel: item.variantLabel,
			sku: item.sku,
			unitPriceCents: item.unitPriceCents,
			quantity: item.quantity,
			lineTotalCents: item.lineTotalCents,
			baseUnitPriceCents: item.baseUnitPriceCents,
			unitDiscountCents: item.unitDiscountCents,
			baseLineTotalCents: item.baseLineTotalCents,
			lineDiscountCents: item.lineDiscountCents,
		}
	}
}

export class PrismaOrderMapper {
	static toDomain(raw: PrismaOrderAggregate): Order {
		// Legacy rows created before the promotion snapshot columns default every
		// snapshot field to 0; treat that as "no snapshot persisted" and let the
		// entity derive a no-promotion snapshot from the charged values.
		const hasSnapshot = raw.baseSubtotalCents > 0

		return Order.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				storeCustomerId: raw.storeCustomerId ? new UniqueEntityID(raw.storeCustomerId) : null,
				guestName: raw.guestName,
				guestPhone: raw.guestPhone,
				orderCode: raw.orderCode,
				status: raw.status as OrderStatus,
				items: raw.items.map(PrismaOrderItemMapper.toDomain),
				subtotalCents: raw.subtotalCents,
				shippingCents: raw.shippingCents,
				totalCents: raw.totalCents,
				baseSubtotalCents: hasSnapshot ? raw.baseSubtotalCents : undefined,
				itemDiscountTotalCents: hasSnapshot ? raw.itemDiscountTotalCents : undefined,
				shippingBaseCents: hasSnapshot ? raw.shippingBaseCents : undefined,
				shippingDiscountCents: hasSnapshot ? raw.shippingDiscountCents : undefined,
				totalDiscountCents: hasSnapshot ? raw.totalDiscountCents : undefined,
				appliedPromotions: hasSnapshot
					? (raw.appliedPromotions as unknown as OrderAppliedPromotion[])
					: undefined,
				shippingAddress: raw.shippingAddress as unknown as OrderShippingAddressSnapshot,
				deliveryLabel: raw.deliveryLabel,
				paymentMethod: raw.paymentMethod as OrderPaymentMethod,
				cancelledAt: raw.cancelledAt,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(order: Order): Prisma.OrderUncheckedCreateInput {
		return {
			id: order.id.toString(),
			storeId: order.storeId.toString(),
			storeCustomerId: order.storeCustomerId?.toString() ?? null,
			guestName: order.guestName,
			guestPhone: order.guestPhone,
			orderCode: order.orderCode,
			status: order.status,
			subtotalCents: order.subtotalCents,
			shippingCents: order.shippingCents,
			totalCents: order.totalCents,
			baseSubtotalCents: order.baseSubtotalCents,
			itemDiscountTotalCents: order.itemDiscountTotalCents,
			shippingBaseCents: order.shippingBaseCents,
			shippingDiscountCents: order.shippingDiscountCents,
			totalDiscountCents: order.totalDiscountCents,
			appliedPromotions: order.appliedPromotions as unknown as Prisma.InputJsonValue,
			shippingAddress: order.shippingAddress as unknown as Prisma.InputJsonValue,
			deliveryLabel: order.deliveryLabel,
			paymentMethod: order.paymentMethod,
			cancelledAt: order.cancelledAt,
			createdAt: order.createdAt,
			updatedAt: order.updatedAt ?? undefined,
		}
	}
}
