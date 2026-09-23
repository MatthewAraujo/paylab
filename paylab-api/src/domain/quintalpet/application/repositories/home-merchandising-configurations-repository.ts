import { HomeMerchandisingConfiguration } from '../../enterprise/entities/home-merchandising-configuration'

export abstract class HomeMerchandisingConfigurationsRepository {
	abstract findByStoreId(storeId: string): Promise<HomeMerchandisingConfiguration | null>
	abstract save(configuration: HomeMerchandisingConfiguration): Promise<void>
}
