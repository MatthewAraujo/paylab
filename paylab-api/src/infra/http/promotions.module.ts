import { DiscoverPromotionsUseCase } from '@/domain/quintalpet/application/use-cases/discover-promotions'
import { ManagePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/manage-promotions'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { PromotionsAdminController } from '@/infra/http/controllers/promotions/promotions-admin.controller'
import { StorefrontPromotionsController } from '@/infra/http/controllers/storefront/storefront-promotions.controller'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, BetterAuthModule],
	controllers: [PromotionsAdminController, StorefrontPromotionsController],
	providers: [ManagePromotionsUseCase, DiscoverPromotionsUseCase, QuotePromotionsUseCase],
})
export class PromotionsModule {}
