import { Injectable, NotFoundException } from '@nestjs/common'
import { CustomerSegment } from '../../enterprise/types/customer-segment'
import { CRMRepository } from '../repositories/crm-repository'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

@Injectable()
export class UpdateCRMSegmentUseCase {
	constructor(
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly crmRepository: CRMRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string, segment: CustomerSegment) {
		const profile = await this.getProfileOrFail(storeId, storeCustomerId)

		profile.updateSegment(segment)
		await this.crmRepository.save(profile)

		return profile
	}

	private async getProfileOrFail(storeId: string, storeCustomerId: string) {
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
