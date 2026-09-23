import { Injectable } from '@nestjs/common'
import { StoreCustomerStatus } from '../../enterprise/types/store-customer-status'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

export interface ListStoreCustomersInput {
	status?: StoreCustomerStatus
	page?: number
	perPage?: number
}

@Injectable()
export class ListStoreCustomersUseCase {
	constructor(private readonly storeCustomersRepository: StoreCustomersRepository) {}

	async execute(storeId: string, input: ListStoreCustomersInput) {
		return this.storeCustomersRepository.listByStore(storeId, {
			status: input.status,
			page: input.page ?? 1,
			perPage: input.perPage ?? 20,
		})
	}
}
