export class InvalidAttachmentTypeError extends Error {
	constructor(type: string) {
		super(`Attachment type "${type}" is not supported.`)
	}
}
