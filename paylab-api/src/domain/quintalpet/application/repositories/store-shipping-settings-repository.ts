import { StoreShippingSettings } from '../../enterprise/entities/store-shipping-settings'

export abstract class StoreShippingSettingsRepository {
	abstract findByStoreId(storeId: string): Promise<StoreShippingSettings | null>
	abstract upsert(settings: StoreShippingSettings): Promise<void>
}
