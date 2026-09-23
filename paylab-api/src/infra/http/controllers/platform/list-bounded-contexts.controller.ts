import { DescribeCatalogBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-catalog-boundary'
import { DescribeIdentityBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-identity-boundary'
import { DescribeInventoryBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-inventory-boundary'
import { DescribeMerchandisingBoundaryUseCase } from '@/domain/quintalpet/application/use-cases/describe-merchandising-boundary'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { Controller, Get } from '@nestjs/common'

// Exposes the admin API's route-prefix map — staff-only, not public recon.
@Controller('/api/v1/platform/bounded-contexts')
@StoreMemberOnly()
export class ListBoundedContextsController {
	constructor(
		private readonly identityBoundaryService: DescribeIdentityBoundaryUseCase,
		private readonly catalogBoundaryService: DescribeCatalogBoundaryUseCase,
		private readonly inventoryBoundaryService: DescribeInventoryBoundaryUseCase,
		private readonly merchandisingBoundaryService: DescribeMerchandisingBoundaryUseCase,
	) {}

	@Get()
	handle() {
		return {
			product: 'quintal-agro-pet',
			boundedContexts: [
				this.identityBoundaryService.describe(),
				this.catalogBoundaryService.describe(),
				this.inventoryBoundaryService.describe(),
				this.merchandisingBoundaryService.describe(),
			],
		}
	}
}
