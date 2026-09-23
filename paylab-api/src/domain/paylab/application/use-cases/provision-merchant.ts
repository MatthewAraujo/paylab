import { Injectable } from '@nestjs/common'
import { Merchant } from '../../enterprise/entities/merchant'
import { MerchantsRepository } from '../repositories/merchants-repository'
import { generateApiKey, hashApiKey } from '../services/api-key'

interface ProvisionMerchantRequest {
	name: string
}

interface ProvisionMerchantResponse {
	merchantId: string
	/** The raw key exists only in this response; only its hash is persisted. */
	apiKey: string
}

@Injectable()
export class ProvisionMerchantUseCase {
	constructor(private merchantsRepository: MerchantsRepository) {}

	async execute({ name }: ProvisionMerchantRequest): Promise<ProvisionMerchantResponse> {
		const merchant = Merchant.create({ name })
		const apiKey = generateApiKey()

		await this.merchantsRepository.createWithApiKey(merchant, hashApiKey(apiKey))

		return { merchantId: merchant.id.toString(), apiKey }
	}
}
