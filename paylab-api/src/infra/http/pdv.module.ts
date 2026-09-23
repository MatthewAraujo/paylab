import { AddItemToSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/add-item-to-sale-draft'
import { CancelSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/cancel-sale-draft'
import { ClosePdvSessionUseCase } from '@/domain/quintalpet/application/use-cases/close-pdv-session'
import { CreateWalkInOrderUseCase } from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { FinalizeSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/finalize-sale-draft'
import { OpenPdvSessionUseCase } from '@/domain/quintalpet/application/use-cases/open-pdv-session'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { RemoveOrAdjustSaleDraftItemUseCase } from '@/domain/quintalpet/application/use-cases/remove-sale-draft-item'
import { ResolveUnmatchedBarcodeUseCase } from '@/domain/quintalpet/application/use-cases/resolve-unmatched-barcode'
import { ResolveVariantByBarcodeUseCase } from '@/domain/quintalpet/application/use-cases/resolve-variant-by-barcode'
import { StartNewSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/start-new-sale-draft'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { PdvAdminController } from '@/infra/http/controllers/pdv/pdv-admin.controller'
import { PdvCartEvents } from '@/infra/http/gateways/pdv-cart-events.service'
import { PdvGateway } from '@/infra/http/gateways/pdv.gateway'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, BetterAuthModule],
	controllers: [PdvAdminController],
	providers: [
		OpenPdvSessionUseCase,
		ClosePdvSessionUseCase,
		AddItemToSaleDraftUseCase,
		RemoveOrAdjustSaleDraftItemUseCase,
		CancelSaleDraftUseCase,
		ResolveVariantByBarcodeUseCase,
		QuotePromotionsUseCase,
		CreateWalkInOrderUseCase,
		FinalizeSaleDraftUseCase,
		ResolveUnmatchedBarcodeUseCase,
		StartNewSaleDraftUseCase,
		PdvCartEvents,
		PdvGateway,
	],
	exports: [ResolveVariantByBarcodeUseCase, AddItemToSaleDraftUseCase],
})
export class PdvModule {}
