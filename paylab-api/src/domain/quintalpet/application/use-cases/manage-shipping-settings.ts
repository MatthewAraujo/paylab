import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Injectable } from '@nestjs/common'
import {
	StoreShippingSettings,
	StoreShippingSettingsInput,
} from '../../enterprise/entities/store-shipping-settings'
import { StoreShippingSettingsRepository } from '../repositories/store-shipping-settings-repository'
import { ResolveCepDistanceService } from './resolve-cep-distance'

@Injectable()
export class ManageShippingSettingsUseCase {
	constructor(
		private readonly repository: StoreShippingSettingsRepository,
		private readonly distanceService: ResolveCepDistanceService,
	) {}

	async get(storeId: string): Promise<StoreShippingSettings | null> {
		return this.repository.findByStoreId(storeId)
	}

	async upsert(storeId: string, input: StoreShippingSettingsInput): Promise<StoreShippingSettings> {
		const existing = await this.repository.findByStoreId(storeId)

		let settings: StoreShippingSettings
		if (existing) {
			existing.update(input)
			settings = existing
		} else {
			settings = StoreShippingSettings.create({
				storeId: new UniqueEntityID(storeId),
				...input,
			})
		}

		// Fail fast on a bad origin CEP, and seed the CepGeocode cache for later
		// quotes. Throws InvalidPostalCodeError (bad CEP) or GeocoderUnavailableError
		// (transient) — the controller maps those to 400 / 503 respectively.
		await this.distanceService.resolveCoordinates(settings.originPostalCode)

		await this.repository.upsert(settings)
		return settings
	}
}
