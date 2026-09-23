import { Injectable } from '@nestjs/common'
import { CustomerSegment } from '../../enterprise/types/customer-segment'
import { CRMRepository } from '../repositories/crm-repository'

export interface ListStoreCustomersBySegmentInput {
	page?: number
	perPage?: number
}

@Injectable()
export class ListStoreCustomersBySegmentUseCase {
	constructor(private readonly crmRepository: CRMRepository) {}

	async execute(
		storeId: string,
		segment: CustomerSegment,
		input: ListStoreCustomersBySegmentInput,
	) {
		return this.crmRepository.listStoreCustomersBySegment(storeId, segment, {
			page: input.page ?? 1,
			perPage: input.perPage ?? 20,
		})
	}
}
