import { getAllowedOrigins } from '@/infra/http/frontend-origin'
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'

type MinimalResponse = {
	setHeader(name: string, value: string): void
	removeHeader(name: string): void
}

type MinimalRequest = {
	path?: string
	originalUrl?: string
	url?: string
}

/**
 * Baseline security response headers for the API. This service speaks only
 * JSON, so the CSP is the most restrictive one possible (`default-src 'none'`)
 * — it still matters because a browser that is tricked into rendering an API
 * response directly then can't execute anything in it. Cloudflare adds its own
 * edge headers; setting them here too keeps the guarantee even for traffic that
 * reaches the origin directly (health checks, internal callers, a misrouted
 * request).
 */
const STATIC_SECURITY_HEADERS: Record<string, string> = {
	'Content-Security-Policy':
		"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'no-referrer',
	'Cross-Origin-Resource-Policy': 'same-site',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browser=()',
}

// Swagger UI (non-production only) is served from this same origin and needs
// inline styles/scripts to render, so its routes get a relaxed CSP instead of
// the locked-down default.
const SWAGGER_PATH_PREFIXES = ['/docs', '/docs-json']
const SWAGGER_CSP =
	"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"

function isSwaggerPath(pathname: string): boolean {
	return SWAGGER_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	)
}

/**
 * Express-style middleware that stamps the security headers on every response
 * and strips the framework's `X-Powered-By` fingerprint.
 */
export function securityHeadersMiddleware() {
	const hstsEnabled = process.env.NODE_ENV === 'production'

	return (req: MinimalRequest, res: MinimalResponse, next: () => void) => {
		res.removeHeader('X-Powered-By')

		const pathname = getPathname(req)

		for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
			if (name === 'Content-Security-Policy' && isSwaggerPath(pathname)) {
				res.setHeader(name, SWAGGER_CSP)
				continue
			}
			res.setHeader(name, value)
		}

		// Only meaningful over HTTPS; emitting it in dev (plain HTTP) just trains
		// browsers with a header they ignore, and can be surprising behind a
		// local proxy. Production terminates TLS at Cloudflare/the platform edge.
		if (hstsEnabled) {
			res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
		}

		next()
	}
}

export function getPathname(req: MinimalRequest): string {
	const raw = req.path ?? req.originalUrl ?? req.url ?? ''
	const queryIndex = raw.indexOf('?')
	return queryIndex === -1 ? raw : raw.slice(0, queryIndex)
}

/**
 * CORS configuration for the API. Allows only the explicitly configured
 * frontend origin(s) and fails closed in production: if no origin is
 * configured, every cross-origin browser request is rejected rather than
 * silently falling back to `http://localhost:3000`.
 */
export function buildCorsOptions(): CorsOptions {
	const allowedOrigins = getAllowedOrigins()

	if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
		// Surfaced at boot so a misconfigured deploy fails visibly instead of
		// serving an API that rejects its own frontend.
		throw new Error(
			'CORS misconfiguration: set FRONTEND_URL (or CORS_ALLOWED_ORIGINS) to the deployed frontend origin(s).',
		)
	}

	return {
		origin(origin, callback) {
			// Same-origin / non-browser callers (curl, server-to-server, health
			// checks) send no Origin header — allowed; they aren't subject to the
			// browser same-origin policy this protects.
			if (!origin || allowedOrigins.includes(origin)) {
				callback(null, true)
				return
			}
			callback(null, false)
		},
		credentials: true,
		methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
		exposedHeaders: ['X-Request-Id'],
		maxAge: 600,
	}
}
