import { StoreShippingSettingsRepository } from '@/domain/quintalpet/application/repositories/store-shipping-settings-repository'
import { calculateDeliveryFee } from '@/domain/quintalpet/enterprise/services/calculate-delivery-fee'
import {
	DELIVERY_OPTIONS,
	DeliveryOptionId,
} from '@/domain/quintalpet/enterprise/services/resolve-delivery-option'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ResolveCepDistanceService } from './resolve-cep-distance'

export interface QuoteDeliveryOptionsInput {
	storeSlug?: string
	postalCode: string
}

export interface QuotedDeliveryOption {
	id: DeliveryOptionId
	label: string
	feeCents: number
	etaDays: readonly [number, number]
	available: boolean
	unavailableReason?: 'out-of-range' | 'not-configured'
}

export interface QuoteDeliveryOptionsResult {
	options: QuotedDeliveryOption[]
}

@Injectable()
export class QuoteDeliveryOptionsUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly shippingSettingsRepository: StoreShippingSettingsRepository,
		private readonly distanceService: ResolveCepDistanceService,
	) {}

	async execute(input: QuoteDeliveryOptionsInput): Promise<QuoteDeliveryOptionsResult> {
		const store = await this.resolveStore(input.storeSlug)

		// Pickup is always offered, free, and geocoding-free — even for an
		// unconfigured store or during a Nominatim outage.
		const pickup: QuotedDeliveryOption = {
			id: 'pickup-store',
			label: DELIVERY_OPTIONS['pickup-store'].label,
			feeCents: 0,
			etaDays: DELIVERY_OPTIONS['pickup-store'].etaDays,
			available: true,
		}

		const localMeta = DELIVERY_OPTIONS['local-shipping']
		const settings = await this.shippingSettingsRepository.findByStoreId(store.id)

		if (!settings) {
			return {
				options: [
					pickup,
					{
						id: 'local-shipping',
						label: localMeta.label,
						feeCents: 0,
						etaDays: localMeta.etaDays,
						available: false,
						unavailableReason: 'not-configured',
					},
				],
			}
		}

		// May throw InvalidPostalCodeError / GeocoderUnavailableError — the
		// controller maps those to 400 / 503.
		const distanceKm = await this.distanceService.resolveDistanceKm(
			settings.originPostalCode,
			input.postalCode,
		)
		const fee = calculateDeliveryFee({ distanceKm, settings })

		return {
			options: [
				pickup,
				{
					id: 'local-shipping',
					label: localMeta.label,
					feeCents: fee.available ? fee.feeCents : 0,
					etaDays: localMeta.etaDays,
					available: fee.available,
					...(fee.available ? {} : { unavailableReason: 'out-of-range' as const }),
				},
			],
		}
	}

	private async resolveStore(storeSlug?: string): Promise<{ id: string; slug: string }> {
		if (storeSlug) {
			const store = await this.prisma.store.findUnique({
				where: { slug: storeSlug },
				select: { id: true, slug: true },
			})
			if (!store) throw new NotFoundException('Store not found.')
			return store
		}

		const stores = await this.prisma.store.findMany({
			select: { id: true, slug: true },
			orderBy: { createdAt: 'asc' },
			take: 2,
		})
		if (stores.length === 1) return stores[0]
		throw new NotFoundException('Store not found.')
	}
}
