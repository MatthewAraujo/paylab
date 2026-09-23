import { CatalogModule } from '@/infra/http/catalog.module'
import { CRMModule } from '@/infra/http/crm.module'
import { CustomersModule } from '@/infra/http/customers.module'
import { IdentityModule } from '@/infra/http/identity.module'
import { InventoryModule } from '@/infra/http/inventory.module'
import { MerchandisingModule } from '@/infra/http/merchandising.module'
import { OrdersModule } from '@/infra/http/orders.module'
import { PdvModule } from '@/infra/http/pdv.module'
import { PlatformModule } from '@/infra/http/platform.module'
import { PromotionsModule } from '@/infra/http/promotions.module'
import { ShippingModule } from '@/infra/http/shipping.module'
import { StorefrontModule } from '@/infra/http/storefront.module'
import { Module } from '@nestjs/common'

@Module({
	imports: [
		IdentityModule,
		CatalogModule,
		InventoryModule,
		MerchandisingModule,
		StorefrontModule,
		PlatformModule,
		CustomersModule,
		CRMModule,
		OrdersModule,
		PdvModule,
		ShippingModule,
		PromotionsModule,
	],
})
export class QuintalAgroPetModule {}
