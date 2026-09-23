import { z } from 'zod'

const betterAuthEnvSchema = z
	.object({
		BETTER_AUTH_SECRET: z
			.string()
			.min(32, 'BETTER_AUTH_SECRET must be at least 32 characters')
			.describe('Secret key for Better Auth (must be high entropy)'),
		BETTER_AUTH_URL: z.string().url().describe('Base URL for Better Auth'),
		DATABASE_URL: z.string().url().describe('PostgreSQL database connection string'),
		GOOGLE_CLIENT_ID: z
			.string()
			.min(1)
			.optional()
			.describe('Google OAuth client ID (optional; provider stays inactive when absent)'),
		GOOGLE_CLIENT_SECRET: z
			.string()
			.min(1)
			.optional()
			.describe('Google OAuth client secret (optional; provider stays inactive when absent)'),
		GOOGLE_REDIRECT_URI: z
			.string()
			.url()
			.optional()
			.describe(
				'Explicit Google OAuth callback URL override (optional; defaults to Better Auth baseURL)',
			),
		FRONTEND_URL: z.string().url().describe('Frontend URL for trusted origins'),
		COOKIE_DOMAIN: z
			.string()
			.startsWith('.', 'COOKIE_DOMAIN must start with a dot (e.g. ".quintal-agropet.com")')
			.optional()
			.describe(
				'Shared parent domain for cross-subdomain session cookies (optional; unset disables it)',
			),
		RESEND_API_KEY: z.string().optional().describe('Resend API key for email integration'),
		EMAIL_FROM: z.string().optional().describe('From address used for transactional emails'),
		DISABLE_TRANSACTIONAL_EMAILS: z.enum(['true', 'false']).optional(),
		NODE_ENV: z.string().optional(),
	})
	.superRefine((env, ctx) => {
		const googleFields = [
			env.GOOGLE_CLIENT_ID,
			env.GOOGLE_CLIENT_SECRET,
			env.GOOGLE_REDIRECT_URI,
		].filter((value) => value && value.length > 0)
		const hasAnyGoogleConfig = googleFields.length > 0
		const hasGoogleClientId = Boolean(env.GOOGLE_CLIENT_ID)
		const hasGoogleClientSecret = Boolean(env.GOOGLE_CLIENT_SECRET)

		if (hasAnyGoogleConfig && !hasGoogleClientId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['GOOGLE_CLIENT_ID'],
				message: 'GOOGLE_CLIENT_ID is required when Google OAuth configuration is enabled.',
			})
		}

		if (hasAnyGoogleConfig && !hasGoogleClientSecret) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['GOOGLE_CLIENT_SECRET'],
				message: 'GOOGLE_CLIENT_SECRET is required when Google OAuth configuration is enabled.',
			})
		}

		if (env.DISABLE_TRANSACTIONAL_EMAILS !== 'true' && !env.RESEND_API_KEY) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['RESEND_API_KEY'],
				message: 'RESEND_API_KEY is required for email sending',
			})
		}

		if (env.DISABLE_TRANSACTIONAL_EMAILS !== 'true' && !env.EMAIL_FROM) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['EMAIL_FROM'],
				message: 'EMAIL_FROM is required for email sending',
			})
		}

		// The PDV socket client connects straight to this API from the browser
		// (no Next.js proxy in between, unlike every REST call), so its session
		// cookie only reaches that handshake if COOKIE_DOMAIN made the cookie
		// visible outside the frontend's own host. Catching a missing value here,
		// at boot, beats discovering it later as PDV silently failing to
		// authenticate in production.
		if (env.NODE_ENV === 'production' && !env.COOKIE_DOMAIN) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['COOKIE_DOMAIN'],
				message:
					'COOKIE_DOMAIN is required in production (e.g. ".quintal-agropet.com") so the session cookie reaches the API host — without it, the PDV WebSocket connection (which talks to the API directly, bypassing the frontend proxy) cannot authenticate.',
			})
		}
	})

export type BetterAuthEnv = z.infer<typeof betterAuthEnvSchema>

export function validateBetterAuthEnv(): BetterAuthEnv {
	try {
		return betterAuthEnvSchema.parse(process.env)
	} catch (error) {
		if (error instanceof z.ZodError) {
			const missing = error.issues
				.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
				.join('\n  ')
			throw new Error(`Better Auth environment validation failed:\n  ${missing}`)
		}
		throw error
	}
}
