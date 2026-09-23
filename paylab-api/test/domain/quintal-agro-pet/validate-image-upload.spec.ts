import {
	imageBufferMatchesMimeType,
	isSupportedImageMimeType,
	sanitizeUploadFileName,
} from '@/domain/quintalpet/enterprise/services/validate-image-upload'
import { TINY_PNG_BUFFER } from '../../fixtures/tiny-png'

describe('validate-image-upload', () => {
	describe('isSupportedImageMimeType', () => {
		test('accepts jpeg/png/webp and rejects everything else', () => {
			expect(isSupportedImageMimeType('image/png')).toBe(true)
			expect(isSupportedImageMimeType('image/jpeg')).toBe(true)
			expect(isSupportedImageMimeType('image/webp')).toBe(true)
			expect(isSupportedImageMimeType('image/svg+xml')).toBe(false)
			expect(isSupportedImageMimeType('text/plain')).toBe(false)
			expect(isSupportedImageMimeType('application/octet-stream')).toBe(false)
		})
	})

	describe('imageBufferMatchesMimeType', () => {
		test('accepts a real PNG buffer declared as image/png', () => {
			expect(imageBufferMatchesMimeType(TINY_PNG_BUFFER, 'image/png')).toBe(true)
		})

		test('rejects arbitrary bytes masquerading as an image', () => {
			expect(imageBufferMatchesMimeType(Buffer.from('not really a png at all'), 'image/png')).toBe(
				false,
			)
		})

		test('rejects a real PNG that claims to be a JPEG', () => {
			expect(imageBufferMatchesMimeType(TINY_PNG_BUFFER, 'image/jpeg')).toBe(false)
		})

		test('recognises JPEG and WebP signatures', () => {
			const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])
			expect(imageBufferMatchesMimeType(jpeg, 'image/jpeg')).toBe(true)

			const webp = Buffer.concat([
				Buffer.from('RIFF'),
				Buffer.from([0x00, 0x00, 0x00, 0x00]),
				Buffer.from('WEBP'),
			])
			expect(imageBufferMatchesMimeType(webp, 'image/webp')).toBe(true)
		})
	})

	describe('sanitizeUploadFileName', () => {
		test('strips directory traversal segments', () => {
			expect(sanitizeUploadFileName('../../other-store/logo.png')).toBe('logo.png')
			expect(sanitizeUploadFileName('..\\..\\windows\\evil.png')).toBe('evil.png')
			expect(sanitizeUploadFileName('/etc/passwd')).toBe('passwd')
		})

		test('replaces unsafe characters and leading dots', () => {
			expect(sanitizeUploadFileName('my photo (1).png')).toBe('my_photo__1_.png')
			expect(sanitizeUploadFileName('...hidden.png')).toBe('hidden.png')
		})

		test('falls back to a placeholder when nothing usable remains', () => {
			expect(sanitizeUploadFileName('///')).toBe('upload')
			expect(sanitizeUploadFileName('')).toBe('upload')
		})
	})
})
