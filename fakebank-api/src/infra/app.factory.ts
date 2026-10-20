import { INestApplication, LogLevel } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Env, buildEnv } from './env/env'
import { ErrorEnvelopeFilter } from './http/errors/error-envelope.filter'
import { setupOpenApi } from './http/openapi/swagger'
import { requestIdMiddleware } from './http/request-id'

// The HTTP configuration shared by `main.ts` and the test application (`buildTestApp`),
// so e2e tests exercise exactly what runs in production.
export function configureApp(app: INestApplication) {
	// Before routing, so unknown routes get a request id too.
	app.use(requestIdMiddleware)
	app.useGlobalFilters(new ErrorEnvelopeFilter())
	// FakeBank is a test environment: its contract is documented in every environment.
	setupOpenApi(app)
	app.enableShutdownHooks()
}

// Errors and warnings are always logged; LOG_ENABLED adds the regular log, LOG_LEVEL=debug the rest.
export function logLevelsFor(env: Pick<Env, 'LOG_ENABLED' | 'LOG_LEVEL'>): LogLevel[] {
	if (!env.LOG_ENABLED) {
		return ['error', 'warn']
	}

	return env.LOG_LEVEL === 'debug'
		? ['error', 'warn', 'log', 'debug', 'verbose']
		: ['error', 'warn', 'log']
}

export async function createApp(): Promise<INestApplication> {
	const env = buildEnv(process.env)
	const app = await NestFactory.create(AppModule, { logger: logLevelsFor(env) })

	configureApp(app)

	return app
}
