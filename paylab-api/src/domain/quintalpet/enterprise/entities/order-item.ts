import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface OrderItemProps {
	orderId: UniqueEntityID
	productId: UniqueEntityID
	variantId: UniqueEntityID
	productName: string
	variantLabel: string
	sku: string
	/** Charged (net) unit price — `baseUnitPriceCents - unitDiscountCents`. */
	unitPriceCents: number
	quantity: number
	/** Charged (net) line total — `baseLineTotalCents - lineDiscountCents`. */
	lineTotalCents: number
	/** Pre-promotion catalog unit price (Catalog owns this value). */
	baseUnitPriceCents: number
	/** Per-unit view of the line discount (`baseUnitPriceCents - unitPriceCents`). */
	unitDiscountCents: number
	/** Pre-promotion line total — `baseUnitPriceCents * quantity`. */
	baseLineTotalCents: number
	/**
	 * Authoritative promotion allocation for this line. `unitPriceCents` /
	 * `unitDiscountCents` are per-unit projections of this value and can differ
	 * from `lineDiscountCents` by up to `quantity - 1` cents when the allocation
	 * is not evenly divisible.
	 */
	lineDiscountCents: number
}

export class OrderItem extends Entity<OrderItemProps> {
	get orderId() {
		return this.props.orderId
	}

	get productId() {
		return this.props.productId
	}

	get variantId() {
		return this.props.variantId
	}

	get productName() {
		return this.props.productName
	}

	get variantLabel() {
		return this.props.variantLabel
	}

	get sku() {
		return this.props.sku
	}

	get unitPriceCents() {
		return this.props.unitPriceCents
	}

	get quantity() {
		return this.props.quantity
	}

	get lineTotalCents() {
		return this.props.lineTotalCents
	}

	get baseUnitPriceCents() {
		return this.props.baseUnitPriceCents
	}

	get unitDiscountCents() {
		return this.props.unitDiscountCents
	}

	get baseLineTotalCents() {
		return this.props.baseLineTotalCents
	}

	get lineDiscountCents() {
		return this.props.lineDiscountCents
	}

	static create(
		props: Optional<
			OrderItemProps,
			| 'lineTotalCents'
			| 'baseUnitPriceCents'
			| 'unitDiscountCents'
			| 'baseLineTotalCents'
			| 'lineDiscountCents'
		>,
		id?: UniqueEntityID,
	) {
		const baseUnitPriceCents = props.baseUnitPriceCents ?? props.unitPriceCents
		const lineDiscountCents = props.lineDiscountCents ?? 0
		const baseLineTotalCents = props.baseLineTotalCents ?? baseUnitPriceCents * props.quantity
		const lineTotalCents = props.lineTotalCents ?? baseLineTotalCents - lineDiscountCents
		const unitDiscountCents = props.unitDiscountCents ?? baseUnitPriceCents - props.unitPriceCents

		return new OrderItem(
			{
				...props,
				lineTotalCents,
				baseUnitPriceCents,
				unitDiscountCents,
				baseLineTotalCents,
				lineDiscountCents,
			},
			id,
		)
	}
}
