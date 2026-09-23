import { AppLogger } from '@/infra/observability/app-logger'
import { HttpLoggingInterceptor } from '@/infra/observability/http-logging.interceptor'
import { RequestContextService } from '@/infra/observability/request-context'
import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { of, throwError } from 'rxjs'

function makeExecutionContext(request: Record<string, unknown>, response: Record<string, unknown>) {
	return {
		getType: () => 'http',
		switchToHttp: () => ({
			getRequest: () => request,
			getResponse: () => response,
		}),
		getClass: () => ({ name: 'CatalogProductsController' }),
		getHandler: () => ({ name: 'create' }),
	} as unknown as ExecutionContext
}

describe('HttpLoggingInterceptor', () => {
	test('logs completed HTTP requests with correlation metadata', async () => {
		const lines: string[] = []
		const requestContext = new RequestContextService()
		const logger = new AppLogger(
			{
				enabled: true,
				level: 'debug',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => requestContext.get(),
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)
		const interceptor = new HttpLoggingInterceptor(requestContext, logger)
		const responseHeaders: Record<string, string> = {}
		const context = makeExecutionContext(
			{
				headers: {},
				method: 'POST',
				originalUrl: '/api/v1/admin/catalog/products',
				route: { path: '/api/v1/admin/catalog/products' },
				body: {
					name: 'Racao Premium',
					slug: 'racao-premium',
				},
				query: {},
				params: {},
				user: {
					id: 'user-1',
				},
				accessibleStores: ['store-1'],
			},
			{
				statusCode: 201,
				setHeader: (name: string, value: string) => {
					responseHeaders[name] = value
				},
			},
		)
		const next: CallHandler = {
			handle: () => of({ ok: true }),
		}

		await new Promise<void>((resolve, reject) => {
			interceptor.intercept(context, next).subscribe({
				next: () => undefined,
				error: reject,
				complete: () => resolve(),
			})
		})

		expect(responseHeaders['x-request-id']).toBeTruthy()
		expect(lines).toHaveLength(4)
		expect(lines[0]).toContain('[HttpLoggingInterceptor] http.request.started')
		expect(lines[1]).toContain('[HttpLoggingInterceptor] http.request.payload')
		expect(lines[1]).toContain("name: 'Racao Premium'")
		expect(lines[1]).toContain("slug: 'racao-premium'")
		expect(lines[2]).toContain('[HttpLoggingInterceptor] http.request.completed')
		expect(lines[2]).toContain("method: 'POST'")
		expect(lines[2]).toContain("route: '/api/v1/admin/catalog/products'")
		expect(lines[2]).toContain("path: '/api/v1/admin/catalog/products'")
		expect(lines[2]).toContain("storeId: 'store-1'")
		expect(lines[2]).toContain("userId: 'user-1'")
		expect(lines[2]).toContain('statusCode: 201')
		expect(lines[2]).toContain(responseHeaders['x-request-id'] ?? '')
		// A successful admin mutation also emits a dedicated security-audit line.
		expect(lines[3]).toContain('[SecurityAudit] security.admin_action')
		expect(lines[3]).toContain("method: 'POST'")
		expect(lines[3]).toContain("actorUserId: 'user-1'")
		expect(lines[3]).toContain('statusCode: 201')
	})

	test('emits a security.forbidden event when a request is rejected with 403', async () => {
		const lines: string[] = []
		const requestContext = new RequestContextService()
		const logger = new AppLogger(
			{
				enabled: true,
				level: 'debug',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => requestContext.get(),
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)
		const interceptor = new HttpLoggingInterceptor(requestContext, logger)
		const context = makeExecutionContext(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/api/v1/admin/stores/other/orders',
				route: { path: '/api/v1/admin/stores/:storeId/orders' },
				query: {},
				params: {},
				user: { id: 'user-1' },
			},
			{ statusCode: 200, setHeader: () => undefined },
		)
		const next: CallHandler = {
			handle: () => throwError(() => new ForbiddenException('nope')),
		}

		await new Promise<void>((resolve) => {
			interceptor.intercept(context, next).subscribe({
				next: () => undefined,
				error: () => resolve(),
				complete: () => resolve(),
			})
		})

		const securityLine = lines.find((line) => line.includes('security.forbidden'))
		expect(securityLine).toBeTruthy()
		expect(securityLine).toContain('[SecurityAudit] security.forbidden')
		expect(securityLine).toContain('statusCode: 403')
		expect(securityLine).toContain("actorUserId: 'user-1'")
	})

	test('logs failed HTTP requests with status and error metadata', async () => {
		const lines: string[] = []
		const requestContext = new RequestContextService()
		const logger = new AppLogger(
			{
				enabled: true,
				level: 'debug',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => requestContext.get(),
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)
		const interceptor = new HttpLoggingInterceptor(requestContext, logger)
		const context = makeExecutionContext(
			{
				headers: {},
				method: 'POST',
				originalUrl: '/api/v1/admin/catalog/products',
				route: { path: '/api/v1/admin/catalog/products' },
				body: {
					name: '',
				},
				query: {},
				params: {},
			},
			{
				statusCode: 500,
				setHeader: () => undefined,
			},
		)
		const next: CallHandler = {
			handle: () => throwError(() => new Error('boom')),
		}

		await new Promise<void>((resolve) => {
			interceptor.intercept(context, next).subscribe({
				next: () => undefined,
				error: () => resolve(),
				complete: () => resolve(),
			})
		})

		expect(lines).toHaveLength(3)
		expect(lines[0]).toContain('[HttpLoggingInterceptor] http.request.started')
		expect(lines[1]).toContain('[HttpLoggingInterceptor] http.request.payload')
		expect(lines[2]).toContain('[HttpLoggingInterceptor] http.request.failed')
		expect(lines[2]).toContain("method: 'POST'")
		expect(lines[2]).toContain("route: '/api/v1/admin/catalog/products'")
		expect(lines[2]).toContain("path: '/api/v1/admin/catalog/products'")
		expect(lines[2]).toContain('statusCode: 500')
		expect(lines[2]).toContain("errorName: 'Error'")
		expect(lines[2]).toContain("errorMessage: 'boom'")
	})
})
