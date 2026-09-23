export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = [
	'image/jpeg',
	'image/png',
	'image/webp',
]

export function isSupportedImageMimeType(fileType: string): fileType is SupportedImageMimeType {
	return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(fileType)
}

/**
 * Byte-signature check: the client controls the multipart `Content-Type`, so a
 * `.exe` renamed to `image/png` sails past a MIME-string check. This inspects
 * the actual leading bytes and confirms they match the claimed type before
 * anything is written to object storage.
 */
export function imageBufferMatchesMimeType(
	body: Buffer,
	fileType: SupportedImageMimeType,
): boolean {
	if (body.length < 12) {
		return false
	}

	switch (fileType) {
		case 'image/jpeg':
			return body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
		case 'image/png':
			return (
				body[0] === 0x89 &&
				body[1] === 0x50 &&
				body[2] === 0x4e &&
				body[3] === 0x47 &&
				body[4] === 0x0d &&
				body[5] === 0x0a &&
				body[6] === 0x1a &&
				body[7] === 0x0a
			)
		case 'image/webp':
			return body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP'
	}
}

/**
 * Strips any path information and unsafe characters from a client-supplied
 * filename before it becomes part of an object-storage key. Without this a
 * `fileName` like `../../other-store/logo.png` would let an upload escape its
 * `stores/<storeId>/attachments/<id>/` prefix.
 */
export function sanitizeUploadFileName(fileName: string): string {
	const base = fileName.replace(/\\/g, '/').split('/').pop()?.trim()

	const cleaned = (base ?? '')
		.replace(/[^A-Za-z0-9._-]/g, '_')
		.replace(/^\.+/, '')
		.slice(0, 128)

	return cleaned.length > 0 ? cleaned : 'upload'
}
