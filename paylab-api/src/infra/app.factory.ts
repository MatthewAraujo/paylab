import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { buildOpenApiDocument } from './http/openapi/swagger'
import {
	buildCorsOptions,
	getPathname,
	securityHeadersMiddleware,
} from './http/security/http-security'
import { AppLogger } from './observability/app-logger'
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor'

const httpLogger = new Logger('HTTP')

export function configureApp(app: INestApplication) {
	// Stamp security headers (CSP, HSTS, X-Content-Type-Options, …) and drop the
	// X-Powered-By fingerprint on every response; this runs before any routing.
	app.use(securityHeadersMiddleware())

	// Per-request access log, emitted before routing so every inbound request is
	// seen. Only the path is logged, never the query string.
	app.use((req: { method: string; url?: string }, _res: unknown, next: () => void) => {
		httpLogger.log(`${req.method} ${getPathname(req)}`)
		next()
	})

	app.enableCors(buildCorsOptions())

	// SwaggerModule.setup mounts its routes on the HTTP adapter, ahead of Nest's
	// own pipeline, so it stays out of production.
	if (process.env.NODE_ENV !== 'production') {
		const swaggerDocument = buildOpenApiDocument(app)

		SwaggerModule.setup('docs', app, swaggerDocument, {
			jsonDocumentUrl: 'docs-json',
		})
	}

	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
		}),
	)
	// Structured per-request logging and security events (401/403/429). Provided
	// by the global ObservabilityModule; wired here as a global interceptor.
	app.useGlobalInterceptors(app.get(HttpLoggingInterceptor))

	app.enableShutdownHooks()
}

export async function createApp(): Promise<INestApplication> {
	const app = await NestFactory.create(AppModule, { bufferLogs: true })

	app.useLogger(app.get(AppLogger))

	configureApp(app)

	return app
}
