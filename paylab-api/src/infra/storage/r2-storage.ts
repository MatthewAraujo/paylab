import { UploadParams, Uploader } from '@/shared/storage/uploader'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable, Logger } from '@nestjs/common'
import { EnvService } from '../env/env.service'

@Injectable()
export class R2Storage implements Uploader {
	private readonly logger = new Logger(R2Storage.name)
	private readonly disabled: boolean
	private readonly publicUrl: string
	private client: S3Client

	constructor(private envService: EnvService) {
		this.disabled = envService.get('DISABLE_R2_UPLOADS')
		this.publicUrl = envService.get('R2_PUBLIC_URL').replace(/\/$/, '')

		const accountId = envService.get('CLOUDFLARE_ACCOUNT_ID')

		this.client = new S3Client({
			endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
			region: 'auto',
			credentials: {
				accessKeyId: envService.get('AWS_ACCESS_KEY_ID'),
				secretAccessKey: envService.get('AWS_SECRET_ACCESS_KEY'),
			},
		})
	}

	async upload({
		storeId,
		attachmentId,
		fileName,
		fileType,
		body,
	}: UploadParams): Promise<{ url: string }> {
		const key = `stores/${storeId}/attachments/${attachmentId}/${fileName}`
		const url = `${this.publicUrl}/${key}`

		if (this.disabled) {
			this.logger.log(`[DISABLE_R2_UPLOADS] Skipped upload, key would be: ${key}`)
			return { url }
		}

		await this.client.send(
			new PutObjectCommand({
				Bucket: this.envService.get('AWS_BUCKET_NAME'),
				Key: key,
				ContentType: fileType,
				Body: body,
			}),
		)

		return { url }
	}
}
