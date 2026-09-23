import { AppLogger } from '@/infra/observability/app-logger'

describe('AppLogger', () => {
	test('does not emit logs when disabled', () => {
		const lines: string[] = []
		const logger = new AppLogger(
			{
				enabled: false,
				level: 'debug',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => ({
				requestId: 'request-1',
			}),
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)

		logger.info('subscription-plan.create.completed', {
			planId: 'plan-1',
		})

		expect(lines).toHaveLength(0)
	})

	test('suppresses debug logs when level is basic', () => {
		const lines: string[] = []
		const logger = new AppLogger(
			{
				enabled: true,
				level: 'basic',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => ({
				requestId: 'request-1',
			}),
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)

		logger.debugEvent('catalog.product.publish.started', {
			storeId: 'store-1',
		})

		expect(lines).toHaveLength(0)
	})

	test('includes request context in emitted structured logs', () => {
		const lines: string[] = []
		const logger = new AppLogger(
			{
				enabled: true,
				level: 'debug',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => ({
				requestId: 'request-1',
				method: 'POST',
				route: '/api/v1/admin/catalog/products',
				path: '/api/v1/admin/catalog/products',
				storeId: 'store-1',
				userId: 'user-1',
			}),
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)

		logger.info('http.request.completed', {
			context: 'HttpLoggingInterceptor',
			statusCode: 201,
			durationMs: 42,
		})

		expect(lines).toHaveLength(1)
		expect(lines[0]).toContain('[Nest]')
		expect(lines[0]).toContain('LOG')
		expect(lines[0]).toContain('[HttpLoggingInterceptor] http.request.completed')
		expect(lines[0]).toContain("requestId: 'request-1'")
		expect(lines[0]).toContain("method: 'POST'")
		expect(lines[0]).toContain("route: '/api/v1/admin/catalog/products'")
		expect(lines[0]).toContain("path: '/api/v1/admin/catalog/products'")
		expect(lines[0]).toContain("storeId: 'store-1'")
		expect(lines[0]).toContain("userId: 'user-1'")
		expect(lines[0]).toContain('statusCode: 201')
		expect(lines[0]).toContain('durationMs: 42')
	})

	test('redacts sensitive keys in metadata payloads', () => {
		const lines: string[] = []
		const logger = new AppLogger(
			{
				enabled: true,
				level: 'debug',
				appName: 'quintal-agro-pet',
				environment: 'test',
				colors: false,
			},
			() => undefined,
			{
				info: (line) => lines.push(line),
				warn: (line) => lines.push(line),
				error: (line) => lines.push(line),
			},
		)

		logger.debugEvent('http.request.payload', {
			context: 'HttpLoggingInterceptor',
			body: {
				password: '123456',
				apiKeyV1: 'secret-key',
				internalName: 'Plano Premium',
			},
		})

		expect(lines).toHaveLength(1)
		expect(lines[0]).toContain('[HttpLoggingInterceptor] http.request.payload')
		expect(lines[0]).toContain("password: '[REDACTED]'")
		expect(lines[0]).toContain("apiKeyV1: '[REDACTED]'")
		expect(lines[0]).toContain("internalName: 'Plano Premium'")
	})
})
