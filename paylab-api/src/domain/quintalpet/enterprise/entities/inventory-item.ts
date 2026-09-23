import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidInventoryQuantityError } from '../errors/invalid-inventory-quantity-error'
import { NegativeInventoryBalanceError } from '../errors/negative-inventory-balance-error'
import { InventoryMovementType } from '../types/inventory-movement-type'
import { InventoryMovement } from './inventory-movement'

interface InventoryItemProps {
	storeId: UniqueEntityID
	variantId: UniqueEntityID
	availableQuantity: number
	movements: InventoryMovement[]
	createdAt: Date
	updatedAt?: Date | null
}

export class InventoryItem extends AggregateRoot<InventoryItemProps> {
	get storeId() {
		return this.props.storeId
	}

	get variantId() {
		return this.props.variantId
	}

	get availableQuantity() {
		return this.props.availableQuantity
	}

	get movements() {
		return this.props.movements
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	receive(quantity: number, note?: string | null) {
		this.assertPositiveQuantity(quantity)
		return this.recordMovement(InventoryMovementType.INBOUND, quantity, note)
	}

	remove(quantity: number, note?: string | null) {
		this.assertPositiveQuantity(quantity)
		return this.recordMovement(InventoryMovementType.OUTBOUND, -quantity, note)
	}

	adjust(quantityDelta: number, note?: string | null) {
		if (quantityDelta === 0) {
			throw new InvalidInventoryQuantityError()
		}

		return this.recordMovement(InventoryMovementType.ADJUSTMENT, quantityDelta, note)
	}

	returnStock(quantity: number, note?: string | null) {
		this.assertPositiveQuantity(quantity)
		return this.recordMovement(InventoryMovementType.RETURN, quantity, note)
	}

	private recordMovement(type: InventoryMovementType, quantityDelta: number, note?: string | null) {
		const balanceAfter = this.props.availableQuantity + quantityDelta

		if (balanceAfter < 0) {
			throw new NegativeInventoryBalanceError()
		}

		const movement = InventoryMovement.create({
			storeId: this.storeId,
			variantId: this.variantId,
			type,
			quantityDelta,
			balanceAfter,
			note,
		})

		this.props.availableQuantity = balanceAfter
		this.props.movements.push(movement)
		this.props.updatedAt = new Date()

		return movement
	}

	private assertPositiveQuantity(quantity: number) {
		if (quantity <= 0) {
			throw new InvalidInventoryQuantityError()
		}
	}

	static create(
		props: Optional<InventoryItemProps, 'availableQuantity' | 'movements' | 'createdAt'>,
		id?: UniqueEntityID,
	) {
		return new InventoryItem(
			{
				...props,
				availableQuantity: props.availableQuantity ?? 0,
				movements: props.movements ?? [],
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
			},
			id,
		)
	}
}
