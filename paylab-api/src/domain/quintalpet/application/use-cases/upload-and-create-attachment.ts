import { Either, left, right } from '@/core/either'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
	imageBufferMatchesMimeType,
	isSupportedImageMimeType,
	sanitizeUploadFileName,
} from '@/domain/quintalpet/enterprise/services/validate-image-upload'
import { Uploader } from '@/shared/storage/uploader'
import { Injectable } from '@nestjs/common'
import { Attachment } from '../../enterprise/entities/attachment'
import { AttachmentsRepository } from '../repositories/attachments-repository'
import { InvalidAttachmentTypeError } from './errors/invalid-attachment-type-error'

interface UploadAndCreateAttachmentRequest {
	storeId: string
	fileName: string
	fileType: string
	body: Buffer
}

type UploadAndCreateAttachmentResponse = Either<
	InvalidAttachmentTypeError,
	{
		attachment: Attachment
	}
>

@Injectable()
export class UploadAndCreateAttachmentUseCase {
	constructor(
		private readonly attachmentsRepository: AttachmentsRepository,
		private readonly uploader: Uploader,
	) {}

	async execute({
		storeId,
		fileName,
		fileType,
		body,
	}: UploadAndCreateAttachmentRequest): Promise<UploadAndCreateAttachmentResponse> {
		if (!isSupportedImageMimeType(fileType)) {
			return left(new InvalidAttachmentTypeError(fileType))
		}

		// Content-Type is client-controlled; confirm the bytes actually are the
		// image type they claim to be before writing to object storage.
		if (!imageBufferMatchesMimeType(body, fileType)) {
			return left(new InvalidAttachmentTypeError(fileType))
		}

		const safeFileName = sanitizeUploadFileName(fileName)
		const attachmentId = new UniqueEntityID()

		const { url } = await this.uploader.upload({
			storeId,
			attachmentId: attachmentId.toString(),
			fileName: safeFileName,
			fileType,
			body,
		})

		const attachment = Attachment.create(
			{
				storeId: new UniqueEntityID(storeId),
				title: safeFileName,
				url,
			},
			attachmentId,
		)

		await this.attachmentsRepository.create(attachment)

		return right({ attachment })
	}
}
