import {
	ListActivePromotionsOptions,
	ListPromotionsByStoreFilters,
	PaginatedPromotions,
	PromotionsRepository,
} from '@/domain/quintalpet/application/repositories/promotions-repository'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PrismaPromotionMapper } from '@/infra/database/prisma/mappers/prisma-promotion-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class PrismaPromotionsRepository implements PromotionsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(id: string, storeId: string): Promise<Promotion | null> {
		const promotion = await this.prisma.promotion.findFirst({
			where: { id, storeId },
		})

		return promotion ? PrismaPromotionMapper.toDomain(promotion) : null
	}

	async listByStore(
		storeId: string,
		filters: ListPromotionsByStoreFilters,
	): Promise<PaginatedPromotions> {
		const where: Prisma.PromotionWhereInput = {
			storeId,
			...(filters.status ? { status: filters.status } : {}),
			...(filters.visibility ? { visibility: filters.visibility } : {}),
			...(filters.channel ? { channels: { has: filters.channel } } : {}),
		}

		const [rows, total] = await Promise.all([
			this.prisma.promotion.findMany({
				where,
				orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
				skip: (filters.page - 1) * filters.perPage,
				take: filters.perPage,
			}),
			this.prisma.promotion.count({ where }),
		])

		return { items: rows.map(PrismaPromotionMapper.toDomain), total }
	}

	async listActiveForChannel(
		storeId: string,
		channel: PromotionChannel,
		options?: ListActivePromotionsOptions,
	): Promise<Promotion[]> {
		const at = options?.at ?? new Date()

		const rows = await this.prisma.promotion.findMany({
			where: {
				storeId,
				status: PromotionStatus.ACTIVE,
				channels: { has: channel },
				...(options?.visibility ? { visibility: options.visibility } : {}),
				AND: [
					{ OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
					{ OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
				],
			},
			orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
		})

		return rows.map(PrismaPromotionMapper.toDomain)
	}

	async save(promotion: Promotion, tx?: Prisma.TransactionClient): Promise<void> {
		const client = tx ?? this.prisma
		const data = PrismaPromotionMapper.toPrisma(promotion)

		await client.promotion.upsert({
			where: { id: promotion.id.toString() },
			create: data,
			update: data,
		})
	}
}
