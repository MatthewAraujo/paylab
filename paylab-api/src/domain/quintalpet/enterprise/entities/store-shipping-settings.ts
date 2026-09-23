import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidShippingSettingsError } from '../errors/invalid-shipping-settings-error'

export interface StoreShippingSettingsProps {
	storeId: UniqueEntityID
	/** Normalized to 8 digits (no dash). */
	originPostalCode: string
	baseCents: number
	perKmCents: number
	maxDistanceKm: number
	/**
	 * Deliveries within this many km cost nothing (base + per-km both waived).
	 * `0` disables free shipping entirely. Must not exceed `maxDistanceKm`.
	 */
	freeShippingDistanceKm: number
	createdAt: Date
	updatedAt?: Date | null
}

export interface StoreShippingSettingsInput {
	originPostalCode: string
	baseCents: number
	perKmCents: number
	maxDistanceKm: number
	freeShippingDistanceKm: number
}

export class StoreShippingSettings extends Entity<StoreShippingSettingsProps> {
	get storeId() {
		return this.props.storeId
	}

	get originPostalCode() {
		return this.props.originPostalCode
	}

	get baseCents() {
		return this.props.baseCents
	}

	get perKmCents() {
		return this.props.perKmCents
	}

	get maxDistanceKm() {
		return this.props.maxDistanceKm
	}

	get freeShippingDistanceKm() {
		return this.props.freeShippingDistanceKm
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	update(input: StoreShippingSettingsInput) {
		const normalized = StoreShippingSettings.validate(input)
		this.props.originPostalCode = normalized.originPostalCode
		this.props.baseCents = normalized.baseCents
		this.props.perKmCents = normalized.perKmCents
		this.props.maxDistanceKm = normalized.maxDistanceKm
		this.props.freeShippingDistanceKm = normalized.freeShippingDistanceKm
		this.props.updatedAt = new Date()
	}

	private static validate(input: StoreShippingSettingsInput): StoreShippingSettingsInput {
		const nonNegativeInt = (value: number, field: string) => {
			if (!Number.isInteger(value) || value < 0) {
				throw new InvalidShippingSettingsError(`${field} must be a non-negative integer`)
			}
		}

		nonNegativeInt(input.baseCents, 'baseCents')
		nonNegativeInt(input.perKmCents, 'perKmCents')
		nonNegativeInt(input.freeShippingDistanceKm, 'freeShippingDistanceKm')

		if (!Number.isInteger(input.maxDistanceKm) || input.maxDistanceKm <= 0) {
			throw new InvalidShippingSettingsError('maxDistanceKm must be a positive integer')
		}

		if (input.freeShippingDistanceKm > input.maxDistanceKm) {
			throw new InvalidShippingSettingsError('freeShippingDistanceKm must not exceed maxDistanceKm')
		}

		const digits = (input.originPostalCode ?? '').replace(/\D/g, '')
		if (digits.length !== 8) {
			throw new InvalidShippingSettingsError('originPostalCode must be a valid 8-digit CEP')
		}

		return { ...input, originPostalCode: digits }
	}

	static create(
		props: Optional<StoreShippingSettingsProps, 'createdAt' | 'updatedAt'>,
		id?: UniqueEntityID,
	) {
		const normalized = StoreShippingSettings.validate({
			originPostalCode: props.originPostalCode,
			baseCents: props.baseCents,
			perKmCents: props.perKmCents,
			maxDistanceKm: props.maxDistanceKm,
			freeShippingDistanceKm: props.freeShippingDistanceKm,
		})

		return new StoreShippingSettings(
			{
				storeId: props.storeId,
				...normalized,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
			},
			id,
		)
	}
}
