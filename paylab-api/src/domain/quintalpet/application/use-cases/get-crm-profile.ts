import { Injectable, NotFoundException } from '@nestjs/common'
import { CRMRepository } from '../repositories/crm-repository'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

@Injectable()
export class GetCRMProfileUseCase {
	constructor(
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly crmRepository: CRMRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string) {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		const profile = await this.crmRepository.findByStoreCustomerId(storeCustomerId)
		if (!profile) {
			throw new NotFoundException('CRM profile not found.')
		}

		return profile
	}
}
