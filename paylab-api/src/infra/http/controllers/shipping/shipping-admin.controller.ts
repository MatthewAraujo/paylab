import { ManageShippingSettingsUseCase } from '@/domain/quintalpet/application/use-cases/manage-shipping-settings'
import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	ShippingSettingsPresenter,
	ShippingSettingsView,
} from '@/infra/http/presenters/shipping-settings-presenter'
import { Body, Controller, Get, Put, ServiceUnavailableException } from '@nestjs/common'
import { z } from 'zod'

const shippingSettingsBodySchema = z.object({
	originPostalCode: z
		.string()
		.regex(/^\d{5}-?\d{3}$/, 'originPostalCode must be a valid Brazilian CEP'),
	baseCents: z.number().int().nonnegative(),
	perKmCents: z.number().int().nonnegative(),
	maxDistanceKm: z.number().int().positive(),
	freeShippingDistanceKm: z.number().int().nonnegative(),
})

type ShippingSettingsBody = z.infer<typeof shippingSettingsBodySchema>

interface ShippingSettingsResponse {
	configured: boolean
	settings: ShippingSettingsView | null
}

@Controller('/api/v1/admin/shipping-settings')
@StoreMemberOnly()
export class ShippingAdminController {
	constructor(private readonly manageShippingSettings: ManageShippingSettingsUseCase) {}

	@Get()
	async get(@CurrentStoreId() storeId: string): Promise<ShippingSettingsResponse> {
		const settings = await this.manageShippingSettings.get(storeId)

		return {
			configured: settings !== null,
			settings: settings ? ShippingSettingsPresenter.toHTTP(settings) : null,
		}
	}

	@Put()
	async put(
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(shippingSettingsBodySchema)) body: ShippingSettingsBody,
	): Promise<ShippingSettingsResponse> {
		try {
			const settings = await this.manageShippingSettings.upsert(storeId, body)

			return { configured: true, settings: ShippingSettingsPresenter.toHTTP(settings) }
		} catch (error) {
			if (error instanceof GeocoderUnavailableError) {
				throw new ServiceUnavailableException({
					code: 'SHIPPING_QUOTE_UNAVAILABLE',
					message: 'Não foi possível calcular o frete agora. Tente novamente.',
				})
			}
			throwTranslatedDomainError(error)
		}
	}
}
