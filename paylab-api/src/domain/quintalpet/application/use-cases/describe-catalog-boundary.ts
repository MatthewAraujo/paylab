import { BoundedContextDescriptor } from '@/domain/quintalpet/application/bounded-context-descriptor'
import { Injectable } from '@nestjs/common'

@Injectable()
export class DescribeCatalogBoundaryUseCase {
	describe(): BoundedContextDescriptor {
		return {
			name: 'catalog',
			routePrefix: '/api/v1/admin/catalog',
			status: 'foundation',
		}
	}
}
