import { DatabaseModule } from '@/infra/database/database.module'
import { EnvModule } from '@/infra/env/env.module'
import { HealthController } from '@/infra/http/health.controller'
import { Module } from '@nestjs/common'

@Module({
	imports: [EnvModule, DatabaseModule],
	controllers: [HealthController],
})
export class AppModule {}
