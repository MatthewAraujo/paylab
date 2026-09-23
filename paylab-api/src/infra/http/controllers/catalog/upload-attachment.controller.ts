import { InvalidAttachmentTypeError } from '@/domain/quintalpet/application/use-cases/errors/invalid-attachment-type-error'
import { UploadAndCreateAttachmentUseCase } from '@/domain/quintalpet/application/use-cases/upload-and-create-attachment'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import {
	BadRequestException,
	Controller,
	HttpCode,
	MaxFileSizeValidator,
	ParseFilePipe,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

@Controller('/api/v1/admin/attachments')
@StoreMemberOnly()
export class UploadAttachmentController {
	constructor(private readonly uploadAndCreateAttachment: UploadAndCreateAttachmentUseCase) {}

	@Post()
	@HttpCode(201)
	@UseInterceptors(FileInterceptor('file'))
	async handle(
		@CurrentStoreId() storeId: string,
		@UploadedFile(
			new ParseFilePipe({
				validators: [
					new MaxFileSizeValidator({
						maxSize: 1024 * 1024 * 2,
					}),
				],
			}),
		)
		file: Express.Multer.File,
	) {
		const result = await this.uploadAndCreateAttachment.execute({
			storeId,
			fileName: file.originalname,
			fileType: file.mimetype,
			body: file.buffer,
		})

		if (result.isLeft()) {
			const error = result.value

			switch (error.constructor) {
				case InvalidAttachmentTypeError:
					throw new BadRequestException(error.message)
				default:
					throw new BadRequestException(error.message)
			}
		}

		const { attachment } = result.value

		return {
			attachmentId: attachment.id.toString(),
		}
	}
}
