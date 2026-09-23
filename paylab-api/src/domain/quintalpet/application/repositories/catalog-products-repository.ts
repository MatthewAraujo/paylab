import { Prisma } from '@prisma/client'
import { Product } from '../../enterprise/entities/product'
import { Sku } from '../../enterprise/value-objects/sku'
import { CatalogSlug } from '../../enterprise/value-objects/slug'

export abstract class CatalogProductsRepository {
	abstract findById(id: string, storeId: string): Promise<Product | null>
	abstract findBySlug(slug: CatalogSlug, storeId: string): Promise<Product | null>
	abstract skuExists(sku: Sku, storeId: string, exceptProductId?: string): Promise<boolean>
	abstract save(product: Product, tx?: Prisma.TransactionClient): Promise<void>
}
