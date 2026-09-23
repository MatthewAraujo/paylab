import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import { OrderItem } from '@/domain/quintalpet/enterprise/entities/order-item'
import { InvalidOrderCommercialSnapshotError } from '@/domain/quintalpet/enterprise/errors/invalid-order-commercial-snapshot-error'
import { InvalidOrderCustomerIdentityError } from '@/domain/quintalpet/enterprise/errors/invalid-order-customer-identity-error'
import { InvalidOrderTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-order-transition-error'
import { generateOrderCode } from '@/domain/quintalpet/enterprise/services/generate-order-code'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'

function createItem(props: Partial<Parameters<typeof OrderItem.create>[0]> = {}) {
	return OrderItem.create({
		orderId: new UniqueEntityID('order-1'),
		productId: new UniqueEntityID('product-1'),
		variantId: new UniqueEntityID('variant-1'),
		productName: 'Racao Premium',
		variantLabel: '15kg',
		sku: 'SKU-001',
		unitPriceCents: 5000,
		quantity: 2,
		...props,
	})
}

function createOrder(props: Partial<Parameters<typeof Order.create>[0]> = {}) {
	return Order.create({
		storeId: new UniqueEntityID('store-1'),
		storeCustomerId: new UniqueEntityID('store-customer-1'),
		orderCode: 'QUIN-ABCD1234',
		items: [createItem()],
		shippingCents: 1000,
		shippingAddress: {
			street: 'Rua das Flores',
			number: '123',
			neighborhood: 'Centro',
			city: 'Sao Paulo',
			state: 'SP',
			postalCode: '01000-000',
		},
		deliveryLabel: 'Standard',
		paymentMethod: OrderPaymentMethod.PIX,
		...props,
	})
}

describe('quintal agro pet orders domain', () => {
	test('OrderItem.create computes lineTotalCents as unitPriceCents * quantity', () => {
		const item = createItem({ unitPriceCents: 5000, quantity: 3 })

		expect(item.lineTotalCents).toBe(15000)
	})

	test('Order.create defaults status to PROCESSING, computes subtotalCents as the sum of item line totals, and totalCents as subtotal + shipping', () => {
		const itemA = createItem({ unitPriceCents: 5000, quantity: 2 }) // 10000
		const itemB = createItem({ unitPriceCents: 3000, quantity: 1 }) // 3000

		const order = createOrder({ items: [itemA, itemB], shippingCents: 1500 })

		expect(order.status).toBe(OrderStatus.PROCESSING)
		expect(order.subtotalCents).toBe(13000)
		expect(order.totalCents).toBe(14500)
	})

	test('Order.create defaults to a no-promotion commercial snapshot: base == charged, every discount 0, no applied promotions', () => {
		const order = createOrder({
			items: [createItem({ unitPriceCents: 5000, quantity: 2 })],
			shippingCents: 1000,
		})

		expect(order.subtotalCents).toBe(10000)
		expect(order.baseSubtotalCents).toBe(10000)
		expect(order.itemDiscountTotalCents).toBe(0)
		expect(order.shippingBaseCents).toBe(1000)
		expect(order.shippingDiscountCents).toBe(0)
		expect(order.totalDiscountCents).toBe(0)
		expect(order.appliedPromotions).toEqual([])
	})

	test('Order.create accepts a discounted snapshot and enforces the commercial invariants', () => {
		const item = createItem({
			unitPriceCents: 4000,
			quantity: 2,
			baseUnitPriceCents: 5000,
			baseLineTotalCents: 10000,
			lineDiscountCents: 2000,
			lineTotalCents: 8000,
		})

		const order = createOrder({
			items: [item],
			shippingCents: 0,
			baseSubtotalCents: 10000,
			itemDiscountTotalCents: 2000,
			shippingBaseCents: 1500,
			shippingDiscountCents: 1500,
			totalDiscountCents: 3500,
			appliedPromotions: [
				{
					id: 'promo-1',
					name: 'Leve 3 pague 2',
					benefitType: 'BUY_X_PAY_Y',
					targetScope: 'ELIGIBLE_ITEMS',
					discountCents: 2000,
					couponCode: null,
				},
			],
		})

		expect(order.subtotalCents).toBe(8000)
		expect(order.shippingCents).toBe(0)
		expect(order.totalCents).toBe(8000)
		expect(order.totalDiscountCents).toBe(3500)
		expect(order.appliedPromotions).toHaveLength(1)
	})

	test('Order.create rejects a snapshot where subtotalCents != baseSubtotalCents - itemDiscountTotalCents', () => {
		expect(() =>
			createOrder({
				items: [createItem({ unitPriceCents: 5000, quantity: 2, lineTotalCents: 10000 })],
				baseSubtotalCents: 10000,
				itemDiscountTotalCents: 500,
			}),
		).toThrow(InvalidOrderCommercialSnapshotError)
	})

	test('Order.create rejects a snapshot where totalDiscountCents != itemDiscountTotalCents + shippingDiscountCents', () => {
		expect(() =>
			createOrder({
				items: [createItem({ unitPriceCents: 5000, quantity: 2, lineTotalCents: 10000 })],
				shippingCents: 1000,
				baseSubtotalCents: 10000,
				itemDiscountTotalCents: 0,
				shippingBaseCents: 1000,
				shippingDiscountCents: 0,
				totalDiscountCents: 999,
			}),
		).toThrow(InvalidOrderCommercialSnapshotError)
	})

	test('transitionTo(READY_FOR_PICKUP) then transitionTo(DELIVERED) succeeds from PROCESSING', () => {
		const order = createOrder()

		order.transitionTo(OrderStatus.READY_FOR_PICKUP)
		expect(order.status).toBe(OrderStatus.READY_FOR_PICKUP)

		order.transitionTo(OrderStatus.DELIVERED)
		expect(order.status).toBe(OrderStatus.DELIVERED)
	})

	test('transitionTo(SHIPPED) then transitionTo(DELIVERED) succeeds from PROCESSING', () => {
		const order = createOrder()

		order.transitionTo(OrderStatus.SHIPPED)
		expect(order.status).toBe(OrderStatus.SHIPPED)

		order.transitionTo(OrderStatus.DELIVERED)
		expect(order.status).toBe(OrderStatus.DELIVERED)
	})

	test('transitionTo(PROCESSING) from DELIVERED throws InvalidOrderTransitionError', () => {
		const order = createOrder()
		order.transitionTo(OrderStatus.SHIPPED)
		order.transitionTo(OrderStatus.DELIVERED)

		expect(() => order.transitionTo(OrderStatus.PROCESSING)).toThrow(InvalidOrderTransitionError)
	})

	test('transitionTo(CANCELLED) succeeds from PROCESSING, READY_FOR_PICKUP, and SHIPPED, and sets cancelledAt', () => {
		const fromProcessing = createOrder()
		fromProcessing.transitionTo(OrderStatus.CANCELLED)
		expect(fromProcessing.status).toBe(OrderStatus.CANCELLED)
		expect(fromProcessing.cancelledAt).not.toBeNull()

		const fromReadyForPickup = createOrder()
		fromReadyForPickup.transitionTo(OrderStatus.READY_FOR_PICKUP)
		fromReadyForPickup.transitionTo(OrderStatus.CANCELLED)
		expect(fromReadyForPickup.status).toBe(OrderStatus.CANCELLED)
		expect(fromReadyForPickup.cancelledAt).not.toBeNull()

		const fromShipped = createOrder()
		fromShipped.transitionTo(OrderStatus.SHIPPED)
		fromShipped.transitionTo(OrderStatus.CANCELLED)
		expect(fromShipped.status).toBe(OrderStatus.CANCELLED)
		expect(fromShipped.cancelledAt).not.toBeNull()
	})

	test('transitionTo(CANCELLED) from DELIVERED throws, and a cancelled order is terminal', () => {
		const delivered = createOrder()
		delivered.transitionTo(OrderStatus.SHIPPED)
		delivered.transitionTo(OrderStatus.DELIVERED)
		expect(() => delivered.transitionTo(OrderStatus.CANCELLED)).toThrow(InvalidOrderTransitionError)

		const cancelled = createOrder()
		cancelled.transitionTo(OrderStatus.CANCELLED)
		expect(() => cancelled.transitionTo(OrderStatus.PROCESSING)).toThrow(
			InvalidOrderTransitionError,
		)
		expect(() => cancelled.transitionTo(OrderStatus.READY_FOR_PICKUP)).toThrow(
			InvalidOrderTransitionError,
		)
		expect(() => cancelled.transitionTo(OrderStatus.SHIPPED)).toThrow(InvalidOrderTransitionError)
		expect(() => cancelled.transitionTo(OrderStatus.DELIVERED)).toThrow(InvalidOrderTransitionError)
	})

	test('Order.create accepts a guest name + phone in place of a storeCustomerId', () => {
		const order = createOrder({
			storeCustomerId: null,
			guestName: 'Cliente Balcao',
			guestPhone: '11999998888',
		})

		expect(order.storeCustomerId).toBeNull()
		expect(order.guestName).toBe('Cliente Balcao')
		expect(order.guestPhone).toBe('11999998888')
	})

	test('Order.create throws InvalidOrderCustomerIdentityError when both a storeCustomerId and guest fields are given', () => {
		expect(() =>
			createOrder({
				storeCustomerId: new UniqueEntityID('store-customer-1'),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
			}),
		).toThrow(InvalidOrderCustomerIdentityError)
	})

	test('Order.create throws InvalidOrderCustomerIdentityError when neither a storeCustomerId nor guest fields are given', () => {
		expect(() => createOrder({ storeCustomerId: null })).toThrow(InvalidOrderCustomerIdentityError)
	})

	test('Order.create throws InvalidOrderCustomerIdentityError when only a guest name or only a guest phone is given', () => {
		expect(() =>
			createOrder({ storeCustomerId: null, guestName: 'Cliente Balcao', guestPhone: undefined }),
		).toThrow(InvalidOrderCustomerIdentityError)

		expect(() =>
			createOrder({ storeCustomerId: null, guestName: undefined, guestPhone: '11999998888' }),
		).toThrow(InvalidOrderCustomerIdentityError)
	})

	test('generateOrderCode returns a string prefixed from the store slug, and never collides across 100 calls', () => {
		const code = generateOrderCode('quintal-agro-pet')

		expect(code.startsWith('QUIN-')).toBe(true)

		const codes = new Set(Array.from({ length: 100 }, () => generateOrderCode('quintal-agro-pet')))
		expect(codes.size).toBe(100)
	})
})
