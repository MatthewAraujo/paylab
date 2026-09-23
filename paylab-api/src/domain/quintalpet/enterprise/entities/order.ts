import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidOrderCommercialSnapshotError } from '../errors/invalid-order-commercial-snapshot-error'
import { InvalidOrderCustomerIdentityError } from '../errors/invalid-order-customer-identity-error'
import { InvalidOrderTransitionError } from '../errors/invalid-order-transition-error'
import { OrderPaymentMethod } from '../types/order-payment-method'
import { OrderStatus } from '../types/order-status'
import { OrderItem } from './order-item'

export interface OrderShippingAddressSnapshot {
	street: string
	number: string
	complement?: string | null
	neighborhood: string
	city: string
	state: string
	postalCode: string
}

export interface OrderAppliedPromotion {
	id: string
	name: string
	benefitType: string
	targetScope: string
	discountCents: number
	couponCode: string | null
}

export interface OrderProps {
	storeId: UniqueEntityID
	// Exactly one of `storeCustomerId` or `guestName` + `guestPhone` must be
	// present — enforced in `Order.create()`. A guest order (a walk-in sale
	// for a customer with no registered account) carries identity directly on
	// the order instead of a real StoreCustomer row.
	storeCustomerId: UniqueEntityID | null
	guestName?: string | null
	guestPhone?: string | null
	orderCode: string
	status: OrderStatus
	items: OrderItem[]
	subtotalCents: number
	shippingCents: number
	totalCents: number
	// Promotions commercial snapshot (ADR 0011). These describe how the charged
	// subtotal / shipping above were reached. A no-promotion order has
	// base == charged and every discount 0.
	baseSubtotalCents: number
	itemDiscountTotalCents: number
	shippingBaseCents: number
	shippingDiscountCents: number
	totalDiscountCents: number
	appliedPromotions: OrderAppliedPromotion[]
	shippingAddress: OrderShippingAddressSnapshot
	deliveryLabel: string
	paymentMethod: OrderPaymentMethod
	cancelledAt?: Date | null
	createdAt: Date
	updatedAt?: Date | null
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.PROCESSING]: [
		OrderStatus.READY_FOR_PICKUP,
		OrderStatus.SHIPPED,
		OrderStatus.CANCELLED,
	],
	[OrderStatus.READY_FOR_PICKUP]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
	[OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
	[OrderStatus.DELIVERED]: [],
	[OrderStatus.CANCELLED]: [],
}

export class Order extends AggregateRoot<OrderProps> {
	get storeId() {
		return this.props.storeId
	}

	get storeCustomerId() {
		return this.props.storeCustomerId
	}

	get guestName() {
		return this.props.guestName ?? null
	}

	get guestPhone() {
		return this.props.guestPhone ?? null
	}

	get orderCode() {
		return this.props.orderCode
	}

	get status() {
		return this.props.status
	}

	get items() {
		return this.props.items
	}

	get subtotalCents() {
		return this.props.subtotalCents
	}

	get shippingCents() {
		return this.props.shippingCents
	}

	get totalCents() {
		return this.props.totalCents
	}

	get baseSubtotalCents() {
		return this.props.baseSubtotalCents
	}

	get itemDiscountTotalCents() {
		return this.props.itemDiscountTotalCents
	}

	get shippingBaseCents() {
		return this.props.shippingBaseCents
	}

	get shippingDiscountCents() {
		return this.props.shippingDiscountCents
	}

	get totalDiscountCents() {
		return this.props.totalDiscountCents
	}

	get appliedPromotions() {
		return this.props.appliedPromotions
	}

	get shippingAddress() {
		return this.props.shippingAddress
	}

	get deliveryLabel() {
		return this.props.deliveryLabel
	}

	get paymentMethod() {
		return this.props.paymentMethod
	}

	get cancelledAt() {
		return this.props.cancelledAt ?? null
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	transitionTo(next: OrderStatus) {
		const allowed = ALLOWED_TRANSITIONS[this.props.status]
		if (!allowed.includes(next)) {
			throw new InvalidOrderTransitionError()
		}
		this.props.status = next
		if (next === OrderStatus.CANCELLED) {
			this.props.cancelledAt = new Date()
		}
		this.touch()
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	static create(
		props: Optional<
			OrderProps,
			| 'status'
			| 'subtotalCents'
			| 'totalCents'
			| 'cancelledAt'
			| 'createdAt'
			| 'storeCustomerId'
			| 'baseSubtotalCents'
			| 'itemDiscountTotalCents'
			| 'shippingBaseCents'
			| 'shippingDiscountCents'
			| 'totalDiscountCents'
			| 'appliedPromotions'
		>,
		id?: UniqueEntityID,
	) {
		const storeCustomerId = props.storeCustomerId ?? null
		const guestName = props.guestName ?? null
		const guestPhone = props.guestPhone ?? null
		const hasStoreCustomer = storeCustomerId !== null
		const hasGuestIdentity = Boolean(guestName) && Boolean(guestPhone)

		if (hasStoreCustomer === hasGuestIdentity) {
			throw new InvalidOrderCustomerIdentityError()
		}

		const subtotalCents = props.items.reduce((sum, item) => sum + item.lineTotalCents, 0)
		const shippingCents = props.shippingCents
		const totalCents = subtotalCents + shippingCents

		const baseSubtotalCents =
			props.baseSubtotalCents ?? props.items.reduce((sum, item) => sum + item.baseLineTotalCents, 0)
		const itemDiscountTotalCents = props.itemDiscountTotalCents ?? baseSubtotalCents - subtotalCents
		const shippingBaseCents = props.shippingBaseCents ?? shippingCents
		const shippingDiscountCents = props.shippingDiscountCents ?? shippingBaseCents - shippingCents
		const totalDiscountCents =
			props.totalDiscountCents ?? itemDiscountTotalCents + shippingDiscountCents
		const appliedPromotions = props.appliedPromotions ?? []

		Order.assertSnapshotInvariants({
			subtotalCents,
			shippingCents,
			baseSubtotalCents,
			itemDiscountTotalCents,
			shippingBaseCents,
			shippingDiscountCents,
			totalDiscountCents,
		})

		return new Order(
			{
				...props,
				storeCustomerId,
				guestName,
				guestPhone,
				status: props.status ?? OrderStatus.PROCESSING,
				subtotalCents,
				totalCents,
				baseSubtotalCents,
				itemDiscountTotalCents,
				shippingBaseCents,
				shippingDiscountCents,
				totalDiscountCents,
				appliedPromotions,
				cancelledAt: props.cancelledAt ?? null,
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}

	private static assertSnapshotInvariants(snapshot: {
		subtotalCents: number
		shippingCents: number
		baseSubtotalCents: number
		itemDiscountTotalCents: number
		shippingBaseCents: number
		shippingDiscountCents: number
		totalDiscountCents: number
	}) {
		if (snapshot.subtotalCents !== snapshot.baseSubtotalCents - snapshot.itemDiscountTotalCents) {
			throw new InvalidOrderCommercialSnapshotError(
				'subtotalCents must equal baseSubtotalCents - itemDiscountTotalCents',
			)
		}
		if (snapshot.shippingCents !== snapshot.shippingBaseCents - snapshot.shippingDiscountCents) {
			throw new InvalidOrderCommercialSnapshotError(
				'shippingCents must equal shippingBaseCents - shippingDiscountCents',
			)
		}
		if (
			snapshot.totalDiscountCents !==
			snapshot.itemDiscountTotalCents + snapshot.shippingDiscountCents
		) {
			throw new InvalidOrderCommercialSnapshotError(
				'totalDiscountCents must equal itemDiscountTotalCents + shippingDiscountCents',
			)
		}
	}
}
