import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { PdvSessionStatus } from '@/domain/quintalpet/enterprise/types/pdv-session-status'
import { Prisma } from '@prisma/client'

type PrismaPdvSessionRecord = Prisma.PdvSessionGetPayload<Record<string, never>>

export class PrismaPdvSessionMapper {
	static toDomain(raw: PrismaPdvSessionRecord): PdvSession {
		return PdvSession.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				openedByUserId: raw.openedByUserId,
				status: raw.status as PdvSessionStatus,
				openedAt: raw.openedAt,
				closedAt: raw.closedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(session: PdvSession): Prisma.PdvSessionUncheckedCreateInput {
		return {
			id: session.id.toString(),
			storeId: session.storeId.toString(),
			openedByUserId: session.openedByUserId,
			status: session.status,
			openedAt: session.openedAt,
			closedAt: session.closedAt,
		}
	}
}
