import { DescribeCatalogBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-catalog-boundary'
import { ImportCatalogProductsUseCase } from '@/domain/quintalpet/application/use-cases/import-catalog-products'
import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { UploadAndCreateAttachmentUseCase } from '@/domain/quintalpet/application/use-cases/upload-and-create-attachment'
import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { DatabaseModule } from '@/infra/database/database.module'
import { catalogAdminControllers } from '@/infra/http/controllers/catalog/controllers'
import { StorageModule } from '@/infra/storage/storage.module'
import { Module } from '@nestjs/common'

@Module({
	imports: [DatabaseModule, StorageModule, BetterAuthModule],
	controllers: catalogAdminControllers,
	providers: [
		DescribeCatalogBoundaryUseCase,
		ImportCatalogProductsUseCase,
		ManageCatalogUseCase,
		UploadAndCreateAttachmentUseCase,
	],
	exports: [DescribeCatalogBoundaryUseCase],
})
export class CatalogModule {}
