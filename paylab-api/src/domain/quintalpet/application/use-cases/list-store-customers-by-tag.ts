import { Injectable } from '@nestjs/common'
import { CRMRepository } from '../repositories/crm-repository'

export interface ListStoreCustomersByTagInput {
	page?: number
	perPage?: number
}

@Injectable()
export class ListStoreCustomersByTagUseCase {
	constructor(private readonly crmRepository: CRMRepository) {}

	async execute(storeId: string, tag: string, input: ListStoreCustomersByTagInput) {
		return this.crmRepository.listStoreCustomersByTag(storeId, tag, {
			page: input.page ?? 1,
			perPage: input.perPage ?? 20,
		})
	}
}
