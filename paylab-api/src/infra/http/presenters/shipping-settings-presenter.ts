import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'

export interface ShippingSettingsView {
	originPostalCode: string
	baseCents: number
	perKmCents: number
	maxDistanceKm: number
	freeShippingDistanceKm: number
	updatedAt: string | null
}

export class ShippingSettingsPresenter {
	static toHTTP(settings: StoreShippingSettings): ShippingSettingsView {
		return {
			originPostalCode: settings.originPostalCode,
			baseCents: settings.baseCents,
			perKmCents: settings.perKmCents,
			maxDistanceKm: settings.maxDistanceKm,
			freeShippingDistanceKm: settings.freeShippingDistanceKm,
			updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null,
		}
	}
}
