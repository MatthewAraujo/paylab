export interface UploadParams {
	storeId: string
	attachmentId: string
	fileName: string
	fileType: string
	body: Buffer
}

export abstract class Uploader {
	abstract upload(params: UploadParams): Promise<{ url: string }>
}
