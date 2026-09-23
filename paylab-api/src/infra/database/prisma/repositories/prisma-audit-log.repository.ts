import { PrismaAuditLogMapper } from '@/infra/database/prisma/mappers/prisma-audit-log-mapper'
import { AuditLogEntry } from '@/shared/audit/audit-log-entry'
import { AuditLogRepository } from '@/shared/audit/audit-log.repository'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(entry: AuditLogEntry): Promise<void> {
		await this.prisma.auditLog.create({
			data: PrismaAuditLogMapper.toPrisma(entry),
		})
	}
}
