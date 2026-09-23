import { BoundedContextDescriptor } from '@/domain/quintalpet/application/bounded-context-descriptor'
import { Injectable } from '@nestjs/common'

@Injectable()
export class DescribeMerchandisingBoundaryUseCase {
	describe(): BoundedContextDescriptor {
		return {
			name: 'merchandising',
			routePrefix: '/api/v1/admin/merchandising',
			status: 'foundation',
		}
	}
}
