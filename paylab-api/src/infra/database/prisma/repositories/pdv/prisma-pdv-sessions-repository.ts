import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { PrismaPdvSessionMapper } from '@/infra/database/prisma/mappers/prisma-pdv-session-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class PrismaPdvSessionsRepository implements PdvSessionsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findOpenByStoreId(storeId: string): Promise<PdvSession | null> {
		const record = await this.prisma.pdvSession.findFirst({
			where: { storeId, status: 'OPEN' },
		})

		return record ? PrismaPdvSessionMapper.toDomain(record) : null
	}

	async findById(pdvSessionId: string, storeId: string): Promise<PdvSession | null> {
		const record = await this.prisma.pdvSession.findFirst({
			where: { id: pdvSessionId, storeId },
		})

		return record ? PrismaPdvSessionMapper.toDomain(record) : null
	}

	async save(session: PdvSession, tx?: Prisma.TransactionClient): Promise<void> {
		const client = tx ?? this.prisma
		const data = PrismaPdvSessionMapper.toPrisma(session)

		await client.pdvSession.upsert({
			where: { id: session.id.toString() },
			create: data,
			update: {
				status: session.status,
				closedAt: session.closedAt,
			},
		})
	}
}
