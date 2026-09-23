import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { InvalidShippingSettingsError } from '@/domain/quintalpet/enterprise/errors/invalid-shipping-settings-error'
import { describe, expect, test } from 'vitest'

const validProps = {
	storeId: new UniqueEntityID('store-1'),
	originPostalCode: '02010-000',
	baseCents: 500,
	perKmCents: 120,
	maxDistanceKm: 15,
	freeShippingDistanceKm: 5,
}

describe('StoreShippingSettings', () => {
	test('accepts a valid set and normalizes the origin CEP to 8 digits', () => {
		const settings = StoreShippingSettings.create(validProps)
		expect(settings.originPostalCode).toBe('02010000')
		expect(settings.baseCents).toBe(500)
	})

	test('rejects negative cents values', () => {
		expect(() => StoreShippingSettings.create({ ...validProps, baseCents: -1 })).toThrow(
			InvalidShippingSettingsError,
		)
		expect(() => StoreShippingSettings.create({ ...validProps, perKmCents: -1 })).toThrow(
			InvalidShippingSettingsError,
		)
		expect(() =>
			StoreShippingSettings.create({ ...validProps, freeShippingDistanceKm: -1 }),
		).toThrow(InvalidShippingSettingsError)
	})

	test('rejects a non-positive maxDistanceKm', () => {
		expect(() => StoreShippingSettings.create({ ...validProps, maxDistanceKm: 0 })).toThrow(
			InvalidShippingSettingsError,
		)
	})

	test('rejects a free-shipping radius larger than maxDistanceKm', () => {
		expect(() =>
			StoreShippingSettings.create({
				...validProps,
				maxDistanceKm: 10,
				freeShippingDistanceKm: 11,
			}),
		).toThrow(InvalidShippingSettingsError)
	})

	test('rejects a non-integer cents value', () => {
		expect(() => StoreShippingSettings.create({ ...validProps, baseCents: 1.5 })).toThrow(
			InvalidShippingSettingsError,
		)
	})

	test('rejects an origin CEP that is not 8 digits', () => {
		expect(() => StoreShippingSettings.create({ ...validProps, originPostalCode: '123' })).toThrow(
			InvalidShippingSettingsError,
		)
	})
})
