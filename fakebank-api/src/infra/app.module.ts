import { DatabaseModule } from '@/infra/database/database.module'
import { EnvModule } from '@/infra/env/env.module'
import { HealthController } from '@/infra/http/health.controller'
import { LabModule } from '@/infra/lab/lab.module'
import { TransactionsModule } from '@/infra/transactions/transactions.module'
import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'

@Module({
	imports: [
		EnvModule,
		DatabaseModule,
		TransactionsModule,
		// AC-29: evaluated once the environment is loaded and validated (EnvModule refuses the
		// flag in production, AC-30).
		ConditionalModule.registerWhen(LabModule, (env) => env.FAKEBANK_LAB_ENABLED === 'true', {
			debug: false,
		}),
	],
	controllers: [HealthController],
})
export class AppModule {}
