import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'

export interface SaleDraftItemProps {
	saleDraftId: UniqueEntityID
	variantId: UniqueEntityID
	// Only variantId + quantity — no price/name snapshot (ADR 0003). A future
	// caller reads those live from the catalog on every display/broadcast.
	quantity: number
}

export class SaleDraftItem extends Entity<SaleDraftItemProps> {
	get saleDraftId() {
		return this.props.saleDraftId
	}

	get variantId() {
		return this.props.variantId
	}

	get quantity() {
		return this.props.quantity
	}

	increaseQuantity(by: number) {
		this.props.quantity += by
	}

	decreaseQuantity(by: number) {
		this.props.quantity -= by
	}

	static create(props: SaleDraftItemProps, id?: UniqueEntityID) {
		return new SaleDraftItem(props, id)
	}
}
