import { Injectable, NotFoundException } from '@nestjs/common'
import { StoreCustomerAddressNotFoundError } from '../../enterprise/errors/store-customer-address-not-found-error'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

export interface UpdateStoreCustomerAddressInput {
	street?: string
	number?: string
	complement?: string | null
	neighborhood?: string
	city?: string
	state?: string
	postalCode?: string
}

@Injectable()
export class UpdateStoreCustomerAddressUseCase {
	constructor(private readonly storeCustomersRepository: StoreCustomersRepository) {}

	async execute(
		storeId: string,
		storeCustomerId: string,
		addressId: string,
		input: UpdateStoreCustomerAddressInput,
	) {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		const address = storeCustomer.addresses.find((item) => item.id.toString() === addressId)
		if (!address) {
			throw new StoreCustomerAddressNotFoundError()
		}

		address.updateDetails(input)
		await this.storeCustomersRepository.save(storeCustomer)

		return { storeCustomer, address }
	}
}
