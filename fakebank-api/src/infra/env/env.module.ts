import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { buildEnv } from './env'
import { EnvService } from './env.service'

// Validates the environment once at boot (the app refuses to start otherwise) and
// exposes it as a typed EnvService everywhere.
@Global()
@Module({
	imports: [
		ConfigModule.forRoot({
			validate: (env) => buildEnv(env),
		}),
	],
	providers: [EnvService],
	exports: [EnvService],
})
export class EnvModule {}
