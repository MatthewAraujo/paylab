import { randomUUID } from 'node:crypto'
import { AppLogger } from '@/infra/observability/app-logger'
import { RequestContextService } from '@/infra/observability/request-context'
import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	NestInterceptor,
} from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
	constructor(
		private readonly requestContext: RequestContextService,
		private readonly logger: AppLogger,
	) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType() !== 'http') {
			return next.handle()
		}

		const http = context.switchToHttp()
		const request = http.getRequest<{
			headers?: Record<string, string | string[] | undefined>
			method: string
			originalUrl?: string
			url?: string
			route?: { path?: string }
			body?: unknown
			query?: unknown
			params?: unknown
		}>()
		const response = http.getResponse<{
			statusCode: number
			setHeader: (name: string, value: string) => void
		}>()
		const startedAt = Date.now()
		const requestIdHeader = request.headers?.['x-request-id']
		const requestId =
			typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0
				? requestIdHeader
				: randomUUID()
		const route = request.route?.path ?? request.originalUrl ?? request.url ?? 'unknown'
		const path = request.originalUrl ?? request.url ?? route

		response.setHeader('x-request-id', requestId)

		const requestContext = {
			requestId,
			method: request.method,
			route,
			path,
		}

		return new Observable((subscriber) =>
			this.requestContext.run(requestContext, () => {
				this.logger.debugEvent('http.request.started', {
					context: 'HttpLoggingInterceptor',
					controllerType: context.getClass().name,
					handlerName: context.getHandler().name,
				})
				this.logger.debugEvent('http.request.payload', {
					context: 'HttpLoggingInterceptor',
					body: request.body,
					query: request.query,
					params: request.params,
				})

				return next
					.handle()
					.pipe(
						tap(() => {
							this.logger.info('http.request.completed', {
								context: 'HttpLoggingInterceptor',
								statusCode: response.statusCode,
								durationMs: Date.now() - startedAt,
							})
						}),
						catchError((error: unknown) => {
							const statusCode = this.resolveStatusCode(error, response.statusCode)

							this.logger.errorEvent('http.request.failed', {
								context: 'HttpLoggingInterceptor',
								statusCode,
								durationMs: Date.now() - startedAt,
								errorName: this.resolveErrorName(error),
								errorMessage: this.resolveErrorMessage(error),
								responseBody: this.resolveErrorResponse(error),
							})

							this.logSecurityEvent(statusCode, {
								method: request.method,
								route,
							})

							return throwError(() => error)
						}),
					)
					.subscribe(subscriber)
			}),
		)
	}

	/**
	 * Dedicated, greppable security-signal log for the auth-relevant status
	 * codes. Kept separate from `http.request.failed` so alerting can key off
	 * `security.*` events without parsing every 4xx.
	 */
	private logSecurityEvent(statusCode: number, details: { method: string; route: string }) {
		const event =
			statusCode === 401
				? 'security.unauthenticated'
				: statusCode === 403
					? 'security.forbidden'
					: statusCode === 429
						? 'security.rate_limited'
						: undefined

		if (!event) {
			return
		}

		this.logger.warnEvent(event, {
			context: 'SecurityAudit',
			statusCode,
			method: details.method,
			route: details.route,
		})
	}

	private resolveStatusCode(error: unknown, fallbackStatusCode: number) {
		if (error instanceof HttpException) {
			return error.getStatus()
		}

		return fallbackStatusCode
	}

	private resolveErrorName(error: unknown) {
		if (error instanceof Error) {
			return error.name
		}

		return 'UnknownError'
	}

	private resolveErrorMessage(error: unknown) {
		if (error instanceof Error) {
			return error.message
		}

		return 'Unknown error'
	}

	private resolveErrorResponse(error: unknown) {
		if (error instanceof HttpException) {
			return error.getResponse()
		}

		return undefined
	}
}
