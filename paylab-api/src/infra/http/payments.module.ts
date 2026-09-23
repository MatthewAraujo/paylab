import { PaymentSubmitter } from '@/domain/paylab/application/services/payment-submitter'
import { CreatePaymentUseCase } from '@/domain/paylab/application/use-cases/create-payment'
import { FundWalletFromClearingUseCase } from '@/domain/paylab/application/use-cases/fund-wallet-from-clearing'
import { GetPaymentUseCase } from '@/domain/paylab/application/use-cases/get-payment'
import { ListPaymentsUseCase } from '@/domain/paylab/application/use-cases/list-payments'
import { AuthModule } from '@/infra/auth/auth.module'
import { LedgerModule } from '@/infra/database/ledger.module'
import { Module } from '@nestjs/common'
import { PaymentsController } from './controllers/payments.controller'

// FundWalletFromClearingUseCase is provided and exported for seed scripts and
// tests only; no controller may depend on it.
@Module({
	imports: [AuthModule, LedgerModule],
	controllers: [PaymentsController],
	providers: [
		PaymentSubmitter,
		CreatePaymentUseCase,
		GetPaymentUseCase,
		ListPaymentsUseCase,
		FundWalletFromClearingUseCase,
	],
	exports: [FundWalletFromClearingUseCase],
})
export class PaymentsModule {}
