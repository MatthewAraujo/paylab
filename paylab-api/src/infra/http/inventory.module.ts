import { DescribeInventoryBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-inventory-boundary'
import { ManageInventoryUseCase } from '@/domain/quintalpet/application/use-cases/manage-inventory'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { InventoryAdminController } from '@/infra/http/controllers/inventory/inventory-admin.controller'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, BetterAuthModule],
	controllers: [InventoryAdminController],
	providers: [DescribeInventoryBoundaryUseCase, ManageInventoryUseCase],
	exports: [DescribeInventoryBoundaryUseCase],
})
export class InventoryModule {}
