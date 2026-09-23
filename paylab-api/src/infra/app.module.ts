import { auth } from '@/infra/better-auth/better-auth'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { buildEnv } from '@/infra/env/env'
import { EnvModule } from '@/infra/env/env.module'
import { HealthModule } from '@/infra/http/health.module'
import { QuintalAgroPetModule } from '@/infra/http/quintal-agro-pet.module'
import { ObservabilityModule } from '@/infra/observability/observability.module'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule as BetterAuthNestModule } from '@thallesp/nestjs-better-auth'

@Module({
	imports: [
		ConfigModule.forRoot({
			validate: (env) => buildEnv(env),
			isGlobal: true,
		}),
		DatabaseModule,
		BetterAuthNestModule.forRoot({
			auth,
			bodyParser: {
				json: { enabled: true },
				urlencoded: { enabled: true },
			},
		}),
		BetterAuthModule,
		HealthModule,
		QuintalAgroPetModule,
		EnvModule,
		ObservabilityModule,
	],
})
export class AppModule {}
