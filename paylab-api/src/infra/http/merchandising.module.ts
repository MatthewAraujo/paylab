import { DescribeMerchandisingBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-merchandising-boundary'
import { ManageMerchandisingUseCase } from '@/domain/quintalpet/application/use-cases/manage-merchandising'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { MerchandisingAdminController } from '@/infra/http/controllers/merchandising/merchandising-admin.controller'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, BetterAuthModule],
	controllers: [MerchandisingAdminController],
	providers: [DescribeMerchandisingBoundaryUseCase, ManageMerchandisingUseCase],
	exports: [DescribeMerchandisingBoundaryUseCase],
})
export class MerchandisingModule {}
