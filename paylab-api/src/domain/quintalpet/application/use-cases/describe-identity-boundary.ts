import { BoundedContextDescriptor } from '@/domain/quintalpet/application/bounded-context-descriptor'
import { Injectable } from '@nestjs/common'

@Injectable()
export class DescribeIdentityBoundaryUseCase {
	describe(): BoundedContextDescriptor {
		return {
			name: 'identity',
			routePrefix: '/api/v1/auth',
			status: 'foundation',
		}
	}
}
