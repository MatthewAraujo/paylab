import { AccountsRepository } from '@/domain/paylab/application/repositories/accounts-repository'
import { PaymentsRepository } from '@/domain/paylab/application/repositories/payments-repository'
import { ReadQueriesRepository } from '@/domain/paylab/application/repositories/read-queries-repository'
import { SettlementPort } from '@/domain/paylab/application/repositories/settlement-port'
import { GetAccountBalanceUseCase } from '@/domain/paylab/application/use-cases/get-account-balance'
import { SettlePaymentUseCase } from '@/domain/paylab/application/use-cases/settle-payment'
import { Module } from '@nestjs/common'
import { PrismaAccountsRepository } from './repositories/prisma-accounts-repository'
import { PrismaPaymentsRepository } from './repositories/prisma-payments-repository'
import { PrismaReadQueriesRepository } from './repositories/prisma-read-queries-repository'
import { PrismaSettlement } from './repositories/prisma-settlement'

// Accounts, Payments, Settlement and the Balance query. DatabaseModule is global,
// so PrismaService is injected without importing it here.
@Module({
	providers: [
		{ provide: AccountsRepository, useClass: PrismaAccountsRepository },
		{ provide: PaymentsRepository, useClass: PrismaPaymentsRepository },
		{ provide: ReadQueriesRepository, useClass: PrismaReadQueriesRepository },
		{ provide: SettlementPort, useClass: PrismaSettlement },
		SettlePaymentUseCase,
		GetAccountBalanceUseCase,
	],
	exports: [
		AccountsRepository,
		PaymentsRepository,
		ReadQueriesRepository,
		SettlementPort,
		SettlePaymentUseCase,
		GetAccountBalanceUseCase,
	],
})
export class LedgerModule {}
