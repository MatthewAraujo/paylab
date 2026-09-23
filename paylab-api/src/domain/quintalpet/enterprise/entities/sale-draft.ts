import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidSaleDraftQuantityError } from '../errors/invalid-sale-draft-quantity-error'
import { SaleDraftItemNotFoundError } from '../errors/sale-draft-item-not-found-error'
import { SaleDraftStatus } from '../types/sale-draft-status'
import { SaleDraftItem } from './sale-draft-item'

export interface SaleDraftProps {
	// Deliberately no reference back to PdvSession beyond this id — SaleDraft
	// only knows its own id and item list (T3). Tying a draft to its session's
	// lifecycle is the use-case layer's job (T6/T7), not this entity's.
	pdvSessionId: UniqueEntityID
	status: SaleDraftStatus
	items: SaleDraftItem[]
	unmatchedBarcodes: string[]
	createdAt: Date
	updatedAt?: Date | null
}

export class SaleDraft extends Entity<SaleDraftProps> {
	get pdvSessionId() {
		return this.props.pdvSessionId
	}

	get status() {
		return this.props.status
	}

	get items() {
		return this.props.items
	}

	get unmatchedBarcodes() {
		return this.props.unmatchedBarcodes
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	get isOpen() {
		return this.props.status === SaleDraftStatus.OPEN
	}

	get isEmpty() {
		return this.props.items.length === 0
	}

	/** Adds a new line for `variantId`, or increments its quantity if one already exists. No stock check here — deliberately (US-26); only finalize (T7) checks stock. */
	addItem(variantId: UniqueEntityID, quantity = 1) {
		const existing = this.findItem(variantId)

		if (existing) {
			existing.increaseQuantity(quantity)
		} else {
			this.props.items.push(SaleDraftItem.create({ saleDraftId: this.id, variantId, quantity }))
		}

		this.touch()
	}

	/** Drops a line entirely, regardless of its current quantity. */
	removeItem(variantId: UniqueEntityID) {
		const index = this.props.items.findIndex((item) => item.variantId.equals(variantId))
		if (index === -1) {
			throw new SaleDraftItemNotFoundError(variantId.toString())
		}

		this.props.items.splice(index, 1)
		this.touch()
	}

	/** Reduces a line's quantity by `amount`; dropping to exactly 0 removes the line (never leaves a zero-quantity line). Reducing past 0 throws. */
	reduceItemQuantity(variantId: UniqueEntityID, amount: number) {
		const item = this.findItem(variantId)
		if (!item) {
			throw new SaleDraftItemNotFoundError(variantId.toString())
		}

		const nextQuantity = item.quantity - amount
		if (nextQuantity < 0) {
			throw new InvalidSaleDraftQuantityError()
		}

		if (nextQuantity === 0) {
			this.removeItem(variantId)
			return
		}

		item.decreaseQuantity(amount)
		this.touch()
	}

	/** Appends a barcode with no matching ProductVariant at scan time. Idempotent — appending the same code twice does not duplicate it. */
	addUnmatchedBarcode(barcode: string) {
		if (!this.props.unmatchedBarcodes.includes(barcode)) {
			this.props.unmatchedBarcodes.push(barcode)
			this.touch()
		}
	}

	/** Removes a resolved barcode from the unmatched list (T8). No-op if it isn't present. */
	removeUnmatchedBarcode(barcode: string) {
		this.props.unmatchedBarcodes = this.props.unmatchedBarcodes.filter((code) => code !== barcode)
		this.touch()
	}

	/** Empties every line and marks the draft CANCELLED — an abandoned cart, discarded without closing the register. */
	cancel() {
		this.props.items = []
		this.props.status = SaleDraftStatus.CANCELLED
		this.touch()
	}

	/** Marks the draft COMPLETED once its finalize (T7) has produced an Order. */
	complete() {
		this.props.status = SaleDraftStatus.COMPLETED
		this.touch()
	}

	private findItem(variantId: UniqueEntityID) {
		return this.props.items.find((item) => item.variantId.equals(variantId))
	}

	private touch() {
		this.props.updatedAt = new Date()
	}

	static create(
		props: Optional<SaleDraftProps, 'status' | 'items' | 'unmatchedBarcodes' | 'createdAt'>,
		id?: UniqueEntityID,
	) {
		return new SaleDraft(
			{
				...props,
				status: props.status ?? SaleDraftStatus.OPEN,
				items: props.items ?? [],
				unmatchedBarcodes: props.unmatchedBarcodes ?? [],
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}
}
