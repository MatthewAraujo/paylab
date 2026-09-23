import { AttachmentsRepository } from '@/domain/quintalpet/application/repositories/attachments-repository'
import { Attachment } from '@/domain/quintalpet/enterprise/entities/attachment'
import { PrismaAttachmentMapper } from '@/infra/database/prisma/mappers/prisma-attachment-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class PrismaAttachmentsRepository implements AttachmentsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(id: string, storeId: string): Promise<Attachment | null> {
		const attachment = await this.prisma.attachment.findFirst({
			where: {
				id,
				storeId: storeId,
			},
		})

		return attachment ? PrismaAttachmentMapper.toDomain(attachment) : null
	}

	async create(attachment: Attachment): Promise<void> {
		await this.prisma.attachment.create({
			data: PrismaAttachmentMapper.toPrisma(attachment),
		})
	}
}
