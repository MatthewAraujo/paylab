import { ManageShippingSettingsUseCase } from '@/domain/quintalpet/application/use-cases/manage-shipping-settings'
import { ResolveCepDistanceService } from '@/domain/quintalpet/application/use-cases/resolve-cep-distance'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { GeocodingModule } from '@/infra/geocoding/geocoding.module'
import { ShippingAdminController } from '@/infra/http/controllers/shipping/shipping-admin.controller'
import { Module } from '@nestjs/common'

/**
 * Distance-based delivery fee (ADR 0007). Owns the admin shipping-settings API
 * and exports the shared distance capability so the storefront quote endpoint
 * (T6) and PlaceOrderUseCase (T7) recompute fees from the same service.
 */
@Module({
	imports: [DatabaseModule, BetterAuthModule, GeocodingModule],
	controllers: [ShippingAdminController],
	providers: [ResolveCepDistanceService, ManageShippingSettingsUseCase],
	exports: [ResolveCepDistanceService],
})
export class ShippingModule {}
