import { Injectable, NotFoundException } from '@nestjs/common'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

export interface UpdateStoreCustomerContactInput {
	name?: string | null
	phone?: string | null
}

@Injectable()
export class UpdateStoreCustomerContactUseCase {
	constructor(private readonly storeCustomersRepository: StoreCustomersRepository) {}

	async execute(storeId: string, storeCustomerId: string, input: UpdateStoreCustomerContactInput) {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		storeCustomer.updateContact(input)
		await this.storeCustomersRepository.save(storeCustomer)

		return storeCustomer
	}
}
