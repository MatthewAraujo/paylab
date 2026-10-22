import { HttpException } from '@nestjs/common'

/**
 * A business error that also sets response headers (e.g. `Retry-After` on a `429`).
 * `ErrorEnvelopeFilter` writes the headers; the body stays the standard envelope.
 */
export class HttpExceptionWithHeaders extends HttpException {
	constructor(
		body: { code: string; message: string },
		status: number,
		readonly headers: Readonly<Record<string, string>>,
	) {
		super(body, status)
	}
}
