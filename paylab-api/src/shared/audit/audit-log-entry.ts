import { AuditActorType, AuditEntityType } from '@prisma/client'

export interface AuditMetadata {
	readonly [key: string]: unknown
}

export interface AuditLogEntry {
	storeId?: string | null
	actorType: AuditActorType
	actorUserId?: string | null
	action: string
	entityType: AuditEntityType
	entityId: string
	metadata?: AuditMetadata | null
}
