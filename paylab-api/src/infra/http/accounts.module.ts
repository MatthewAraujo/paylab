import { CreateWalletUseCase } from '@/domain/paylab/application/use-cases/create-wallet'
import { GetAccountUseCase } from '@/domain/paylab/application/use-cases/get-account'
import { ListAccountEntriesUseCase } from '@/domain/paylab/application/use-cases/list-account-entries'
import { ListAccountsUseCase } from '@/domain/paylab/application/use-cases/list-accounts'
import { AuthModule } from '@/infra/auth/auth.module'
import { LedgerModule } from '@/infra/database/ledger.module'
import { Module } from '@nestjs/common'
import { AccountsController } from './controllers/accounts.controller'

@Module({
	imports: [AuthModule, LedgerModule],
	controllers: [AccountsController],
	providers: [
		CreateWalletUseCase,
		GetAccountUseCase,
		ListAccountEntriesUseCase,
		ListAccountsUseCase,
	],
})
export class AccountsModule {}
