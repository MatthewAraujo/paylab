import { AddCRMTagUseCase } from '@/domain/quintalpet/application/use-cases/add-crm-tag'
import { GetCRMProfileUseCase } from '@/domain/quintalpet/application/use-cases/get-crm-profile'
import { ListCRMInteractionsUseCase } from '@/domain/quintalpet/application/use-cases/list-crm-interactions'
import { ListStoreCustomersBySegmentUseCase } from '@/domain/quintalpet/application/use-cases/list-store-customers-by-segment'
import { ListStoreCustomersByTagUseCase } from '@/domain/quintalpet/application/use-cases/list-store-customers-by-tag'
import { RecordCRMInteractionUseCase } from '@/domain/quintalpet/application/use-cases/record-crm-interaction'
import { RemoveCRMTagUseCase } from '@/domain/quintalpet/application/use-cases/remove-crm-tag'
import { UpdateCRMSegmentUseCase } from '@/domain/quintalpet/application/use-cases/update-crm-segment'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { CRMAdminController } from '@/infra/http/controllers/crm/crm-admin.controller'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, BetterAuthModule],
	controllers: [CRMAdminController],
	providers: [
		GetCRMProfileUseCase,
		UpdateCRMSegmentUseCase,
		AddCRMTagUseCase,
		RemoveCRMTagUseCase,
		RecordCRMInteractionUseCase,
		ListCRMInteractionsUseCase,
		ListStoreCustomersBySegmentUseCase,
		ListStoreCustomersByTagUseCase,
	],
})
export class CRMModule {}
