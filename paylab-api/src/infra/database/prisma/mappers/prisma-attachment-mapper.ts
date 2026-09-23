import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Attachment } from '@/domain/quintalpet/enterprise/entities/attachment'
import { Prisma, Attachment as PrismaAttachment } from '@prisma/client'

export class PrismaAttachmentMapper {
	static toDomain(raw: PrismaAttachment): Attachment {
		return Attachment.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				title: raw.title,
				url: raw.url,
				createdAt: raw.createdAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(attachment: Attachment): Prisma.AttachmentUncheckedCreateInput {
		return {
			id: attachment.id.toString(),
			storeId: attachment.storeId.toString(),
			title: attachment.title,
			url: attachment.url,
			createdAt: attachment.createdAt,
		}
	}
}
