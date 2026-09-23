import { Merchant } from '../../enterprise/entities/merchant'

export abstract class MerchantsRepository {
	/** Creates the Merchant and its first API key hash atomically. */
	abstract createWithApiKey(merchant: Merchant, keyHash: string): Promise<void>
}
