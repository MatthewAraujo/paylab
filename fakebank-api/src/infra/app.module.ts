import { DatabaseModule } from '@/infra/database/database.module'
import { EnvModule } from '@/infra/env/env.module'
import { HealthController } from '@/infra/http/health.controller'
import { TransactionsModule } from '@/infra/transactions/transactions.module'
import { Module } from '@nestjs/common'

@Module({
	imports: [EnvModule, DatabaseModule, TransactionsModule],
	controllers: [HealthController],
})
export class AppModule {}
