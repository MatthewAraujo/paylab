import { Either, left, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { ApiKeysRepository } from '../repositories/api-keys-repository'
import { hashApiKey, hashesMatch } from '../services/api-key'
import { InvalidApiKeyError } from './errors/invalid-api-key-error'

interface AuthenticateMerchantRequest {
	apiKey: string
}

type AuthenticateMerchantResponse = Either<InvalidApiKeyError, { merchantId: string }>

@Injectable()
export class AuthenticateMerchantUseCase {
	constructor(private apiKeysRepository: ApiKeysRepository) {}

	async execute({ apiKey }: AuthenticateMerchantRequest): Promise<AuthenticateMerchantResponse> {
		if (!apiKey) {
			return left(new InvalidApiKeyError())
		}

		const keyHash = hashApiKey(apiKey)
		const record = await this.apiKeysRepository.findByKeyHash(keyHash)

		// The lookup is an index probe; the explicit constant-time check keeps the
		// decision itself independent of how much of the hash matched.
		if (!record || record.revokedAt || !hashesMatch(record.keyHash, keyHash)) {
			return left(new InvalidApiKeyError())
		}

		return right({ merchantId: record.merchantId })
	}
}
