import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import {
	buildCorsOptions,
	getPathname,
	securityHeadersMiddleware,
} from './http/security/http-security'
import { AppLogger } from './observability/app-logger'
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor'

const httpLogger = new Logger('HTTP')

export function configureApp(app: INestApplication) {
	// PdvGateway (T10, ADR 0004) needs Socket.IO, not Nest's raw `ws` default.
	// Explicit even though @nestjs/platform-socket.io is often auto-detected,
	// per Nest's own websockets docs.
	app.useWebSocketAdapter(new IoAdapter(app))

	// Stamp security headers (CSP, HSTS, X-Content-Type-Options, …) and drop the
	// X-Powered-By fingerprint on every response, Better Auth's raw routes
	// included — this runs before any routing.
	app.use(securityHeadersMiddleware())

	// Better Auth's routes are mounted as raw middleware ahead of Nest's own
	// router, so they never reach HttpLoggingInterceptor. Logging here, before
	// any routing happens, is the only way to see every inbound request
	// (Better Auth's and ours) in one place. Only the path is logged, never the
	// query string — email-verification and password-reset links carry
	// single-use tokens there.
	const appLogger = app.get(AppLogger)
	app.use(
		(
			req: { method: string; url?: string },
			res: { statusCode: number; on(event: string, listener: () => void): void },
			next: () => void,
		) => {
			const pathname = getPathname(req)
			httpLogger.log(`${req.method} ${pathname}`)

			// Better Auth handles sign-in / sign-up / password-reset itself and
			// never reaches the Nest interceptor, so its auth failures are logged
			// here instead — failed logins, throttled attempts, blocked origins.
			if (pathname.startsWith('/api/auth/')) {
				res.on('finish', () => {
					const event =
						res.statusCode === 401 || res.statusCode === 403
							? 'security.auth_failure'
							: res.statusCode === 429
								? 'security.rate_limited'
								: undefined
					if (event) {
						appLogger.warnEvent(event, {
							context: 'SecurityAudit',
							method: req.method,
							route: pathname,
							statusCode: res.statusCode,
						})
					}
				})
			}

			next()
		},
	)

	app.enableCors(buildCorsOptions())

	// SwaggerModule.setup mounts its routes directly on the underlying HTTP
	// adapter, ahead of Nest's own guard pipeline — @StoreMemberOnly() and
	// friends never see these requests. That's fine for dev/staging recon,
	// but in production it hands out a full map of the admin API surface
	// (every route, DTO shape) to anyone, unauthenticated. Only registered
	// outside production.
	if (process.env.NODE_ENV !== 'production') {
		const swaggerConfig = new DocumentBuilder()
			.setTitle('Quintal Agro Pet API')
			.setDescription(
				'Backend for Quintal Agro Pet with admin catalog, inventory, merchandising, and public storefront APIs.',
			)
			.setVersion('0.0.1')
			.addBearerAuth()
			.build()
		const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig)

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
	// Structured per-request logging + security events (401/403/429) + admin
	// action audit trail. Provided by the global ObservabilityModule; wired here
	// as a global interceptor so it actually runs (it was dead code before).
	app.useGlobalInterceptors(app.get(HttpLoggingInterceptor))

	app.enableShutdownHooks()
}

export async function createApp(): Promise<INestApplication> {
	const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true })

	app.useLogger(app.get(AppLogger))

	configureApp(app)

	return app
}
