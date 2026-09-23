import {
	CRMRepository,
	PaginatedStoreCustomers,
	Pagination,
} from '@/domain/quintalpet/application/repositories/crm-repository'
import { CRMProfile } from '@/domain/quintalpet/enterprise/entities/crm-profile'
import { CustomerSegment } from '@/domain/quintalpet/enterprise/types/customer-segment'
import {
	PrismaCRMProfileAggregate,
	PrismaCrmProfileMapper,
} from '@/infra/database/prisma/mappers/prisma-crm-profile-mapper'
import {
	PrismaStoreCustomerAggregate,
	PrismaStoreCustomerMapper,
} from '@/infra/database/prisma/mappers/prisma-store-customer-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class PrismaCRMRepository implements CRMRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findByStoreCustomerId(storeCustomerId: string): Promise<CRMProfile | null> {
		const record = await this.prisma.cRMProfile.findUnique({
			where: { storeCustomerId },
			include: { interactions: true },
		})

		return record ? PrismaCrmProfileMapper.toDomain(record as PrismaCRMProfileAggregate) : null
	}

	async listStoreCustomersBySegment(
		storeId: string,
		segment: CustomerSegment,
		pagination: Pagination,
	): Promise<PaginatedStoreCustomers> {
		return this.listStoreCustomers(storeId, { crmProfile: { segment } }, pagination)
	}

	async listStoreCustomersByTag(
		storeId: string,
		tag: string,
		pagination: Pagination,
	): Promise<PaginatedStoreCustomers> {
		return this.listStoreCustomers(storeId, { crmProfile: { tags: { has: tag } } }, pagination)
	}

	private async listStoreCustomers(
		storeId: string,
		crmFilter: Record<string, unknown>,
		pagination: Pagination,
	): Promise<PaginatedStoreCustomers> {
		const where = { storeId, ...crmFilter }

		const [records, total] = await Promise.all([
			this.prisma.storeCustomer.findMany({
				where,
				include: { addresses: true },
				skip: (pagination.page - 1) * pagination.perPage,
				take: pagination.perPage,
				orderBy: { createdAt: 'desc' },
			}),
			this.prisma.storeCustomer.count({ where }),
		])

		return {
			items: records.map((record) =>
				PrismaStoreCustomerMapper.toDomain(record as PrismaStoreCustomerAggregate),
			),
			total,
		}
	}

	async save(crmProfile: CRMProfile, tx?: Prisma.TransactionClient): Promise<void> {
		const data = PrismaCrmProfileMapper.toPrisma(crmProfile)

		const run = async (client: Prisma.TransactionClient | PrismaService) => {
			await client.cRMProfile.upsert({
				where: { id: data.id },
				create: data,
				update: {
					segment: data.segment,
					tags: data.tags,
					notes: data.notes,
					lastContactAt: data.lastContactAt,
					updatedAt: data.updatedAt,
				},
			})

			const existing = await client.cRMInteraction.findMany({
				where: { crmProfileId: crmProfile.id.toString() },
				select: { id: true },
			})
			const existingIds = new Set(existing.map((row) => row.id))
			const newInteractions = crmProfile.interactions.filter(
				(interaction) => !existingIds.has(interaction.id.toString()),
			)

			if (newInteractions.length > 0) {
				await client.cRMInteraction.createMany({
					data: newInteractions.map((interaction) =>
						PrismaCrmProfileMapper.interactionToPrisma(interaction, crmProfile.id.toString()),
					),
				})
			}
		}

		if (tx) {
			await run(tx)
		} else {
			await this.prisma.$transaction((transaction) => run(transaction))
		}
	}
}
