import { AuditLogEntry } from '@/shared/audit/audit-log-entry'
import { AuditLogRepository } from '@/shared/audit/audit-log.repository'

export class InMemoryAuditLogRepository implements AuditLogRepository {
	public items: AuditLogEntry[] = []

	async create(entry: AuditLogEntry): Promise<void> {
		this.items.push(entry)
	}
}
