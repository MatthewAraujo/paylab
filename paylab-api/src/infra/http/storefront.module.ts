import { QueryStorefrontUseCase } from '@/domain/quintalpet/application/use-cases/query-storefront'
import { QuoteDeliveryOptionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-delivery-options'
import { DatabaseModule } from '@/infra/database/database.module'
import { StorefrontController } from '@/infra/http/controllers/storefront/storefront.controller'
import { ShippingModule } from '@/infra/http/shipping.module'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, ShippingModule],
	controllers: [StorefrontController],
	providers: [QueryStorefrontUseCase, QuoteDeliveryOptionsUseCase],
})
export class StorefrontModule {}
