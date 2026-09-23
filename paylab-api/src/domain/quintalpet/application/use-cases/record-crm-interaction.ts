import { Injectable, NotFoundException } from '@nestjs/common'
import { CRMInteractionChannel } from '../../enterprise/types/crm-interaction-channel'
import { CRMInteractionType } from '../../enterprise/types/crm-interaction-type'
import { CRMRepository } from '../repositories/crm-repository'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'

export interface RecordCRMInteractionInput {
	type: CRMInteractionType
	channel: CRMInteractionChannel
	subject?: string | null
	content?: string | null
	createdBy?: string | null
}

@Injectable()
export class RecordCRMInteractionUseCase {
	constructor(
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly crmRepository: CRMRepository,
	) {}

	async execute(storeId: string, storeCustomerId: string, input: RecordCRMInteractionInput) {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		const profile = await this.crmRepository.findByStoreCustomerId(storeCustomerId)
		if (!profile) {
			throw new NotFoundException('CRM profile not found.')
		}

		const interaction = profile.recordInteraction(input)
		await this.crmRepository.save(profile)

		return { profile, interaction }
	}
}
