import { ClientAuthGuard } from '@/infra/auth/client-auth.guard'
import { ScenariosModule } from '@/infra/scenarios/scenarios.module'
import { TransactionsModule } from '@/infra/transactions/transactions.module'
import { Module } from '@nestjs/common'
import { AdvanceProviderTransactionService } from './advance-provider-transaction.service'
import { AdvanceController } from './advance.controller'
import { ScenariosController } from './scenarios.controller'

/**
 * The lab surface (`/__test/...`). AppModule imports it only with FAKEBANK_LAB_ENABLED=true, so
 * otherwise its routes do not exist (404 like any unknown route) and are absent from `/docs`.
 */
@Module({
	imports: [ScenariosModule, TransactionsModule],
	controllers: [ScenariosController, AdvanceController],
	providers: [ClientAuthGuard, AdvanceProviderTransactionService],
})
export class LabModule {}
