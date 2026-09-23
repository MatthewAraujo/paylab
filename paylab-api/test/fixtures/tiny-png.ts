/**
 * A real 1x1 transparent PNG. Upload validation now byte-checks the payload
 * against its declared MIME type, so tests must send a buffer with a valid
 * image signature rather than arbitrary text.
 */
export const TINY_PNG_BUFFER = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64',
)
