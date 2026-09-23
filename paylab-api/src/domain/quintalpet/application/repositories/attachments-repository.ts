import { Attachment } from '../../enterprise/entities/attachment'

export abstract class AttachmentsRepository {
	abstract findById(id: string, storeId: string): Promise<Attachment | null>
	abstract create(attachment: Attachment): Promise<void>
}
