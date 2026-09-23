import { AttachmentsRepository } from '@/domain/quintalpet/application/repositories/attachments-repository'
import { CatalogBrandsRepository } from '@/domain/quintalpet/application/repositories/catalog-brands-repository'
import { CatalogCategoriesRepository } from '@/domain/quintalpet/application/repositories/catalog-categories-repository'
import { CatalogProductsRepository } from '@/domain/quintalpet/application/repositories/catalog-products-repository'
import { CepGeocodesRepository } from '@/domain/quintalpet/application/repositories/cep-geocodes-repository'
import { CRMRepository } from '@/domain/quintalpet/application/repositories/crm-repository'
import { CuratedHomeOffersRepository } from '@/domain/quintalpet/application/repositories/curated-home-offers-repository'
import { CustomerFavoritesRepository } from '@/domain/quintalpet/application/repositories/customer-favorites-repository'
import { HomeMerchandisingConfigurationsRepository } from '@/domain/quintalpet/application/repositories/home-merchandising-configurations-repository'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { PromotionsRepository } from '@/domain/quintalpet/application/repositories/promotions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { StoreShippingSettingsRepository } from '@/domain/quintalpet/application/repositories/store-shipping-settings-repository'
import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogBrandsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-brands-repository'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaCatalogProductsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-products-repository'
import { PrismaCRMRepository } from '@/infra/database/prisma/repositories/crm/prisma-crm-repository'
import { PrismaCustomerFavoritesRepository } from '@/infra/database/prisma/repositories/customers/prisma-customer-favorites-repository'
import { PrismaStoreCustomersRepository } from '@/infra/database/prisma/repositories/customers/prisma-store-customers-repository'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'
import { PrismaHomeMerchandisingConfigurationsRepository } from '@/infra/database/prisma/repositories/merchandising/prisma-home-merchandising-configurations-repository'
import { PrismaOrdersRepository } from '@/infra/database/prisma/repositories/orders/prisma-orders-repository'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'
import { PrismaAttachmentsRepository } from '@/infra/database/prisma/repositories/prisma-attachments-repository'
import { PrismaAuditLogRepository } from '@/infra/database/prisma/repositories/prisma-audit-log.repository'
import { PrismaStoresRepository } from '@/infra/database/prisma/repositories/prisma-stores-repository'
import { PrismaCuratedHomeOffersRepository } from '@/infra/database/prisma/repositories/promotions/prisma-curated-home-offers-repository'
import { PrismaPromotionsRepository } from '@/infra/database/prisma/repositories/promotions/prisma-promotions-repository'
import { PrismaCepGeocodesRepository } from '@/infra/database/prisma/repositories/shipping/prisma-cep-geocodes-repository'
import { PrismaStoreShippingSettingsRepository } from '@/infra/database/prisma/repositories/shipping/prisma-store-shipping-settings-repository'
import { AuditLogRepository } from '@/shared/audit/audit-log.repository'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
	providers: [
		PrismaService,
		{
			provide: StoresRepository,
			useClass: PrismaStoresRepository,
		},
		{
			provide: AttachmentsRepository,
			useClass: PrismaAttachmentsRepository,
		},
		{
			provide: CatalogBrandsRepository,
			useClass: PrismaCatalogBrandsRepository,
		},
		{
			provide: CatalogCategoriesRepository,
			useClass: PrismaCatalogCategoriesRepository,
		},
		{
			provide: CatalogProductsRepository,
			useClass: PrismaCatalogProductsRepository,
		},
		{
			provide: InventoryItemsRepository,
			useClass: PrismaInventoryItemsRepository,
		},
		{
			provide: HomeMerchandisingConfigurationsRepository,
			useClass: PrismaHomeMerchandisingConfigurationsRepository,
		},
		{
			provide: AuditLogRepository,
			useClass: PrismaAuditLogRepository,
		},
		{
			provide: StoreCustomersRepository,
			useClass: PrismaStoreCustomersRepository,
		},
		{
			provide: CustomerFavoritesRepository,
			useClass: PrismaCustomerFavoritesRepository,
		},
		{
			provide: CRMRepository,
			useClass: PrismaCRMRepository,
		},
		{
			provide: OrdersRepository,
			useClass: PrismaOrdersRepository,
		},
		{
			provide: PdvSessionsRepository,
			useClass: PrismaPdvSessionsRepository,
		},
		{
			provide: SaleDraftsRepository,
			useClass: PrismaSaleDraftsRepository,
		},
		{
			provide: CepGeocodesRepository,
			useClass: PrismaCepGeocodesRepository,
		},
		{
			provide: StoreShippingSettingsRepository,
			useClass: PrismaStoreShippingSettingsRepository,
		},
		{
			provide: PromotionsRepository,
			useClass: PrismaPromotionsRepository,
		},
		{
			provide: CuratedHomeOffersRepository,
			useClass: PrismaCuratedHomeOffersRepository,
		},
	],
	exports: [
		PrismaService,
		AttachmentsRepository,
		StoresRepository,
		CatalogBrandsRepository,
		CatalogCategoriesRepository,
		CatalogProductsRepository,
		InventoryItemsRepository,
		HomeMerchandisingConfigurationsRepository,
		AuditLogRepository,
		StoreCustomersRepository,
		CustomerFavoritesRepository,
		CRMRepository,
		OrdersRepository,
		PdvSessionsRepository,
		SaleDraftsRepository,
		CepGeocodesRepository,
		StoreShippingSettingsRepository,
		PromotionsRepository,
		CuratedHomeOffersRepository,
	],
})
export class DatabaseModule {}
