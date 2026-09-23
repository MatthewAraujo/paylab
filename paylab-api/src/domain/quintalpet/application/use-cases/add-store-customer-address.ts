import { Injectable, NotFoundException } from '@nestjs/common'
import { StoreCustomerAddress } from '../../enterprise/entities/store-customer-address'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

export interface AddStoreCustomerAddressInput {
	street: string
	number: string
	complement?: string | null
	neighborhood: string
	city: string
	state: string
	postalCode: string
	isDefault?: boolean
}

@Injectable()
export class AddStoreCustomerAddressUseCase {
	constructor(private readonly storeCustomersRepository: StoreCustomersRepository) {}

	async execute(storeId: string, storeCustomerId: string, input: AddStoreCustomerAddressInput) {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		const address = StoreCustomerAddress.create({
			storeCustomerId: storeCustomer.id,
			...input,
		})
		storeCustomer.addAddress(address)
		await this.storeCustomersRepository.save(storeCustomer)

		return { storeCustomer, address }
	}
}
