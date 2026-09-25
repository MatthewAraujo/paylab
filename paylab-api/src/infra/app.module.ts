import { AuthModule } from '@/infra/auth/auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { LedgerModule } from '@/infra/database/ledger.module'
import { buildEnv } from '@/infra/env/env'
import { EnvModule } from '@/infra/env/env.module'
import { AccountsModule } from '@/infra/http/accounts.module'
import { BenchmarksModule } from '@/infra/http/benchmarks.module'
import { HealthModule } from '@/infra/http/health.module'
import { PaymentsModule } from '@/infra/http/payments.module'
import { ReportsModule } from '@/infra/http/reports.module'
import { ObservabilityModule } from '@/infra/observability/observability.module'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

@Module({
	imports: [
		ConfigModule.forRoot({
			validate: (env) => buildEnv(env),
			isGlobal: true,
		}),
		DatabaseModule,
		AuthModule,
		LedgerModule,
		AccountsModule,
		PaymentsModule,
		ReportsModule,
		BenchmarksModule,
		HealthModule,
		EnvModule,
		ObservabilityModule,
	],
})
export class AppModule {}
