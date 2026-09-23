import { DescribeIdentityBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-identity-boundary'
import { GetCurrentStoreMemberProfileUseCase } from '@/domain/quintalpet/application/use-cases/get-current-store-member-profile'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { GetCurrentAdminController } from '@/infra/http/controllers/identity/get-current-admin.controller'
import { Module } from '@nestjs/common'

@Module({
	imports: [BetterAuthModule, DatabaseModule],
	controllers: [GetCurrentAdminController],
	providers: [DescribeIdentityBoundaryUseCase, GetCurrentStoreMemberProfileUseCase],
	exports: [DescribeIdentityBoundaryUseCase],
})
export class IdentityModule {}
