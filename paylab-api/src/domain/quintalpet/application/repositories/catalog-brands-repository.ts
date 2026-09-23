import { Prisma } from '@prisma/client'
import { Brand } from '../../enterprise/entities/brand'
import { CatalogSlug } from '../../enterprise/value-objects/slug'

export abstract class CatalogBrandsRepository {
	abstract findById(id: string, storeId: string): Promise<Brand | null>
	abstract findBySlug(slug: CatalogSlug, storeId: string): Promise<Brand | null>
	abstract save(brand: Brand, tx?: Prisma.TransactionClient): Promise<void>
}
