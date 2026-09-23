import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InventoryMovementType } from '../types/inventory-movement-type'

interface InventoryMovementProps {
	storeId: UniqueEntityID
	variantId: UniqueEntityID
	type: InventoryMovementType
	quantityDelta: number
	balanceAfter: number
	note?: string | null
	createdAt: Date
}

export class InventoryMovement extends Entity<InventoryMovementProps> {
	get storeId() {
		return this.props.storeId
	}

	get variantId() {
		return this.props.variantId
	}

	get type() {
		return this.props.type
	}

	get quantityDelta() {
		return this.props.quantityDelta
	}

	get balanceAfter() {
		return this.props.balanceAfter
	}

	get note() {
		return this.props.note ?? null
	}

	get createdAt() {
		return this.props.createdAt
	}

	static create(
		props: Optional<InventoryMovementProps, 'note' | 'createdAt'>,
		id?: UniqueEntityID,
	) {
		return new InventoryMovement(
			{
				...props,
				note: props.note ?? null,
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}
}
