import { AuditLogEntry } from './audit-log-entry'

export abstract class AuditLogRepository {
	abstract create(entry: AuditLogEntry): Promise<void>
}
