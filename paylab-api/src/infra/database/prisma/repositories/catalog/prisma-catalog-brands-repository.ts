import { CatalogBrandsRepository } from '@/domain/quintalpet/application/repositories/catalog-brands-repository'
import { Brand } from '@/domain/quintalpet/enterprise/entities/brand'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import { PrismaBrandMapper } from '@/infra/database/prisma/mappers/prisma-brand-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class PrismaCatalogBrandsRepository implements CatalogBrandsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(id: string, storeId: string): Promise<Brand | null> {
		const brand = await this.prisma.brand.findFirst({
			where: { id, storeId: storeId },
		})

		return brand ? PrismaBrandMapper.toDomain(brand) : null
	}

	async findBySlug(slug: CatalogSlug, storeId: string): Promise<Brand | null> {
		const brand = await this.prisma.brand.findFirst({
			where: { storeId: storeId, slug: slug.value },
		})

		return brand ? PrismaBrandMapper.toDomain(brand) : null
	}

	async save(brand: Brand, tx?: Prisma.TransactionClient): Promise<void> {
		const client = tx ?? this.prisma
		const data = PrismaBrandMapper.toPrisma(brand)

		await client.brand.upsert({
			where: { id: brand.id.toString() },
			create: data,
			update: data,
		})
	}
}
