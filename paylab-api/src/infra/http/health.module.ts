import { EnvModule } from '@/infra/env/env.module'
import { Module } from '@nestjs/common'
import { HealthController } from './controllers/health.controller'

@Module({
	imports: [EnvModule],
	controllers: [HealthController],
})
export class HealthModule {}
