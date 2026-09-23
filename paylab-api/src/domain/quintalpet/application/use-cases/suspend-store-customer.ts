import { Injectable, NotFoundException } from '@nestjs/common'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

@Injectable()
export class SuspendStoreCustomerUseCase {
	constructor(private readonly storeCustomersRepository: StoreCustomersRepository) {}

	async execute(storeId: string, storeCustomerId: string) {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		storeCustomer.suspend()
		await this.storeCustomersRepository.save(storeCustomer)

		return storeCustomer
	}
}
