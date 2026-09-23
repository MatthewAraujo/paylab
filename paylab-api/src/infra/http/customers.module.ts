import { AddFavoriteProductUseCase } from '@/domain/quintalpet/application/use-cases/add-favorite-product'
import { AddStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/add-store-customer-address'
import { GetFavoriteProductSlugsUseCase } from '@/domain/quintalpet/application/use-cases/get-favorite-product-slugs'
import { GetOrCreateStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/get-or-create-store-customer'
import { GetStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/get-store-customer'
import { ListStoreCustomersUseCase } from '@/domain/quintalpet/application/use-cases/list-store-customers'
import { ReactivateStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/reactivate-store-customer'
import { RemoveFavoriteProductUseCase } from '@/domain/quintalpet/application/use-cases/remove-favorite-product'
import { RemoveStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/remove-store-customer-address'
import { ReplaceFavoriteProductSlugsUseCase } from '@/domain/quintalpet/application/use-cases/replace-favorite-product-slugs'
import { SetDefaultStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/set-default-store-customer-address'
import { SuspendStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/suspend-store-customer'
import { UpdateStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/update-store-customer-address'
import { UpdateStoreCustomerContactUseCase } from '@/domain/quintalpet/application/use-cases/update-store-customer-contact'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { AccountSelfServiceController } from '@/infra/http/controllers/customers/account-self-service.controller'
import { CheckEmailController } from '@/infra/http/controllers/customers/check-email.controller'
import { CustomersAdminController } from '@/infra/http/controllers/customers/customers-admin.controller'
import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'

@Module({
	imports: [
		DatabaseModule,
		BetterAuthModule,
		// Only CheckEmailController uses this (see its @Throttle()) — it's the
		// one custom, unauthenticated endpoint that lets a caller enumerate
		// registered accounts by email, and it sits outside Better Auth's own
		// routing (which has its own built-in rate limiting), so nothing else
		// protects it.
		ThrottlerModule.forRoot({
			throttlers: [{ ttl: 60_000, limit: 100 }],
			skipIf: () => process.env.NODE_ENV === 'test',
		}),
	],
	controllers: [CustomersAdminController, AccountSelfServiceController, CheckEmailController],
	providers: [
		GetOrCreateStoreCustomerUseCase,
		ListStoreCustomersUseCase,
		GetStoreCustomerUseCase,
		UpdateStoreCustomerContactUseCase,
		AddStoreCustomerAddressUseCase,
		UpdateStoreCustomerAddressUseCase,
		RemoveStoreCustomerAddressUseCase,
		SetDefaultStoreCustomerAddressUseCase,
		SuspendStoreCustomerUseCase,
		ReactivateStoreCustomerUseCase,
		GetFavoriteProductSlugsUseCase,
		ReplaceFavoriteProductSlugsUseCase,
		AddFavoriteProductUseCase,
		RemoveFavoriteProductUseCase,
	],
	exports: [GetOrCreateStoreCustomerUseCase],
})
export class CustomersModule {}
