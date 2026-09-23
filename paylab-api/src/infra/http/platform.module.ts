import { BetterAuthModule } from '@/infra/better-auth/better-auth.module'
import { CatalogModule } from '@/infra/http/catalog.module'
import { ListBoundedContextsController } from '@/infra/http/controllers/platform/list-bounded-contexts.controller'
import { IdentityModule } from '@/infra/http/identity.module'
import { InventoryModule } from '@/infra/http/inventory.module'
import { MerchandisingModule } from '@/infra/http/merchandising.module'
import { Module } from '@nestjs/common'

@Module({
	imports: [BetterAuthModule, IdentityModule, CatalogModule, InventoryModule, MerchandisingModule],
	controllers: [ListBoundedContextsController],
})
export class PlatformModule {}
