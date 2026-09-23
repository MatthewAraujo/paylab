import { AuditLogEntry } from '@/shared/audit/audit-log-entry'
import { Prisma } from '@prisma/client'

export class PrismaAuditLogMapper {
	static toPrisma(entry: AuditLogEntry): Prisma.AuditLogUncheckedCreateInput {
		return {
			storeId: entry.storeId ?? null,
			actorType: entry.actorType,
			actorUserId: entry.actorUserId ?? null,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : undefined,
		}
	}
}
