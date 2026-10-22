import { ClientAuthGuard } from '@/infra/auth/client-auth.guard'
import { ScenariosModule } from '@/infra/scenarios/scenarios.module'
import { Module } from '@nestjs/common'
import { ScenariosController } from './scenarios.controller'

/**
 * The lab surface (`/__test/...`). AppModule imports it only with FAKEBANK_LAB_ENABLED=true, so
 * otherwise its routes do not exist (404 like any unknown route) and are absent from `/docs`.
 */
@Module({
	imports: [ScenariosModule],
	controllers: [ScenariosController],
	providers: [ClientAuthGuard],
})
export class LabModule {}
