export interface ApiKeyRecord {
	merchantId: string
	keyHash: string
	revokedAt: Date | null
}

/** Only hashes cross this boundary; the raw key is never stored. */
export abstract class ApiKeysRepository {
	abstract findByKeyHash(keyHash: string): Promise<ApiKeyRecord | null>
}
