export abstract class CacheRepository {
	abstract set(key: string, value: any, ttl?: number): Promise<void>
	abstract get<T>(key: string): Promise<string | null>
	abstract delete(key: string): Promise<void>
}
