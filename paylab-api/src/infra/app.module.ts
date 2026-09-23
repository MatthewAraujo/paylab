import { buildEnv } from '@/infra/env/env'
import { EnvModule } from '@/infra/env/env.module'
import { HealthModule } from '@/infra/http/health.module'
import { ObservabilityModule } from '@/infra/observability/observability.module'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

@Module({
	imports: [
		ConfigModule.forRoot({
			validate: (env) => buildEnv(env),
			isGlobal: true,
		}),
		HealthModule,
		EnvModule,
		ObservabilityModule,
	],
})
export class AppModule {}
