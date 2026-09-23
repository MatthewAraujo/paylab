import { BoundedContextDescriptor } from '@/domain/quintalpet/application/bounded-context-descriptor'
import { Injectable } from '@nestjs/common'

@Injectable()
export class DescribeInventoryBoundaryUseCase {
	describe(): BoundedContextDescriptor {
		return {
			name: 'inventory',
			routePrefix: '/api/v1/admin/inventory',
			status: 'foundation',
		}
	}
}
