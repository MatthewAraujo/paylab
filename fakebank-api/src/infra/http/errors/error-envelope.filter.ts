import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { requestIdOf } from '../request-id'
import { ErrorEnvelope, defaultCodeFor, isRetryable } from './error-envelope'
import { HttpExceptionWithHeaders } from './http-exception-with-headers'

const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.'

/**
 * Global filter: every error leaves FakeBank as an ErrorEnvelope. An `HttpException` keeps
 * its status, and its body may carry `{ code, message }` for business errors. Anything else is
 * an unexpected failure: logged here, answered as a generic 500 that never exposes the original
 * message or stack.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
	private readonly logger = new Logger(ErrorEnvelopeFilter.name)

	catch(exception: unknown, host: ArgumentsHost) {
		const response = host.switchToHttp().getResponse<Response>()
		const { status, code, message } = this.describe(exception)
		const body: ErrorEnvelope = {
			code,
			message,
			retryable: isRetryable(status),
			requestId: requestIdOf(response),
		}

		if (exception instanceof HttpExceptionWithHeaders) {
			response.set(exception.headers)
		}
		response.status(status).json(body)
	}

	private describe(exception: unknown): { status: number; code: string; message: string } {
		if (!(exception instanceof HttpException)) {
			this.logger.error(
				exception instanceof Error ? (exception.stack ?? exception.message) : exception,
			)
			return { status: 500, code: defaultCodeFor(500), message: INTERNAL_ERROR_MESSAGE }
		}

		const status = exception.getStatus()
		const payload = exception.getResponse()
		const fields =
			typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
		const hasBusinessCode = typeof fields.code === 'string'
		const code = hasBusinessCode ? (fields.code as string) : defaultCodeFor(status)
		const rawMessage = fields.message ?? payload
		const message = Array.isArray(rawMessage)
			? rawMessage.join('; ')
			: typeof rawMessage === 'string'
				? rawMessage
				: exception.message

		// A 5xx thrown with its own { code, message } is a simulated provider failure whose message
		// is part of the contract; any other 5xx may carry internal details, so it is hidden.
		const exposed = status < 500 || hasBusinessCode
		return { status, code, message: exposed ? message : INTERNAL_ERROR_MESSAGE }
	}
}
