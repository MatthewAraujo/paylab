import { CancelOrderUseCase } from '@/domain/quintalpet/application/use-cases/cancel-order'
import { CreateWalkInOrderUseCase } from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { GetOrderUseCase } from '@/domain/quintalpet/application/use-cases/get-order'
import { ListOrdersUseCase } from '@/domain/quintalpet/application/use-cases/list-orders'
import { PlaceOrderUseCase } from '@/domain/quintalpet/application/use-cases/place-order'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { TransitionOrderStatusUseCase } from '@/domain/quintalpet/application/use-cases/transition-order-status'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { OrdersAdminController } from '@/infra/http/controllers/orders/orders-admin.controller'
import { OrdersSelfServiceController } from '@/infra/http/controllers/orders/orders-self-service.controller'
import { CustomersModule } from '@/infra/http/customers.module'
import { ShippingModule } from '@/infra/http/shipping.module'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, BetterAuthModule, CustomersModule, ShippingModule],
	controllers: [OrdersSelfServiceController, OrdersAdminController],
	providers: [
		PlaceOrderUseCase,
		QuotePromotionsUseCase,
		ListOrdersUseCase,
		GetOrderUseCase,
		TransitionOrderStatusUseCase,
		CancelOrderUseCase,
		CreateWalkInOrderUseCase,
	],
})
export class OrdersModule {}
