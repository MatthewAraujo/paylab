import { ClientAuthGuard } from '@/infra/auth/client-auth.guard'
import { ScenariosModule } from '@/infra/scenarios/scenarios.module'
import { Module } from '@nestjs/common'
import { CreateProviderTransactionService } from './create-provider-transaction.service'
import { DOMAIN_CLOCK, systemClock } from './domain-clock'
import { ProviderTransactionRepository } from './provider-transaction.repository'
import { TransactionsController } from './transactions.controller'

@Module({
	imports: [ScenariosModule],
	controllers: [TransactionsController],
	providers: [
		ClientAuthGuard,
		CreateProviderTransactionService,
		ProviderTransactionRepository,
		{ provide: DOMAIN_CLOCK, useValue: systemClock },
	],
})
export class TransactionsModule {}
