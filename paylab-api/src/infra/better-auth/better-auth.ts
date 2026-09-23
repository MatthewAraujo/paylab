import { booleanFromString } from '@/infra/env/env'
import { getFrontendOrigin } from '@/infra/http/frontend-origin'
import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { Resend } from 'resend'

const logger = new Logger('BetterAuth')
const resend = new Resend(process.env.RESEND_API_KEY)
const emailFrom = process.env.EMAIL_FROM as string
const prisma = new PrismaClient()
const disableTransactionalEmails = booleanFromString.parse(process.env.DISABLE_TRANSACTIONAL_EMAILS)

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI
const socialProviders =
	googleClientId && googleClientSecret
		? {
				google: {
					clientId: googleClientId,
					clientSecret: googleClientSecret,
					...(googleRedirectUri ? { redirectURI: googleRedirectUri } : {}),
				},
			}
		: undefined

export const auth = betterAuth({
	appName: 'Quintal Agro Pet',

	database: new Pool({
		connectionString: process.env.DATABASE_URL,
	}),

	secret: process.env.BETTER_AUTH_SECRET,
	basePath: '/api/auth',
	baseURL: process.env.BETTER_AUTH_URL,

	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,

		sendResetPassword: async ({ user, url }) => {
			if (disableTransactionalEmails) {
				logger.log(`[DISABLE_TRANSACTIONAL_EMAILS] Password reset URL for ${user.email}: ${url}`)
				return
			}

			const { data, error } = await resend.emails.send({
				from: emailFrom,
				to: user.email,
				subject: 'Redefinição de senha',
				html: `
					<h1>Redefinição de senha</h1>
					<p>Clique no link abaixo para redefinir sua senha:</p>
					<a href="${url}">Redefinir senha</a>
					<p>Este link expira em 24 horas.</p>
					<p>Se você não solicitou isso, pode ignorar este e-mail.</p>
				`,
			})

			if (error) {
				logger.error(
					`Failed to send password reset email to ${user.email}: ${JSON.stringify(error)}`,
				)
				return
			}

			logger.log(`Password reset email sent to ${user.email} (id: ${data?.id})`)
		},
	},

	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,

		sendVerificationEmail: async ({ user, token }) => {
			const frontendUrl = getFrontendOrigin()
			const verificationUrl = `${frontendUrl}/api/account/verify-email?token=${encodeURIComponent(token)}`

			if (disableTransactionalEmails) {
				logger.log(
					`[DISABLE_TRANSACTIONAL_EMAILS] Verification URL for ${user.email}: ${verificationUrl}`,
				)
				return
			}

			const { data, error } = await resend.emails.send({
				from: emailFrom,
				to: user.email,
				subject: 'Confirme seu endereço de e-mail',
				html: `
					<h1>Bem-vindo(a) à Quintal Agro Pet!</h1>
					<p>Confirme seu endereço de e-mail clicando no link abaixo:</p>
					<a href="${verificationUrl}">Confirmar e-mail</a>
					<p>Este link expira em 24 horas.</p>
				`,
			})

			if (error) {
				logger.error(`Failed to send verification email to ${user.email}: ${JSON.stringify(error)}`)
				return
			}

			logger.log(`Verification email sent to ${user.email} (id: ${data?.id})`)
		},
	},

	...(socialProviders ? { socialProviders } : {}),

	account: {
		encryptOAuthTokens: true,

		accountLinking: {
			enabled: true,
			trustedProviders: ['google', 'credential'],
			allowDifferentEmails: false,
		},
	},

	trustedOrigins: [getFrontendOrigin()],

	// Most frontend calls go through a Next.js server-side proxy that relays
	// this cookie under the frontend's own host, so cross-domain delivery
	// isn't usually a concern. The PDV Socket.IO client is the exception — it
	// connects from the browser straight to this API (no proxy), so the
	// cookie only reaches that handshake if it's valid for this API's host
	// too. Left unset in local dev (single host, nothing to share). In
	// production COOKIE_DOMAIN must be the shared parent domain (e.g.
	// ".quintal-agropet.com") so the API can live on a subdomain (e.g.
	// api.quintal-agropet.com) while the cookie still reaches it.
	advanced: {
		// Force the `Secure` attribute on every auth cookie in production even
		// though TLS terminates upstream (Cloudflare / the platform edge), so
		// Better Auth doesn't see an https:// connection directly.
		useSecureCookies: process.env.NODE_ENV === 'production',
		defaultCookieAttributes: {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
		},
		...(process.env.COOKIE_DOMAIN
			? {
					crossSubDomainCookies: {
						enabled: true,
						domain: process.env.COOKIE_DOMAIN,
					},
				}
			: {}),
	},

	// Better Auth's own defaults already rate-limit /sign-in, /sign-up, and
	// password-reset/verification paths sensibly (3 req/10s for sign-in,
	// 3 req/60s for reset/verification) — but `enabled` defaults to
	// production-only, so brute force and account enumeration against
	// sign-in were wide open outside NODE_ENV=production. Explicit here so
	// it's on in dev/staging too, while staying off for the automated test
	// suite (which signs users in far faster than any real client).
	rateLimit: {
		enabled: process.env.NODE_ENV !== 'test',
		window: 60,
		max: 100,
		// Better Auth's built-in special rules already tighten /sign-in and
		// /sign-up (3 req/10s) and /request-password-reset (3 req/60s). These
		// add explicit coverage for the paths those rules miss and pin the
		// values so a future dependency bump can't silently loosen them.
		// NOTE: storage is in-memory — fine for a single instance, but a
		// horizontally scaled deployment should move this to Redis via
		// `secondaryStorage` (ioredis is already a dependency).
		customRules: {
			'/sign-in/email': { window: 60, max: 10 },
			'/sign-up/email': { window: 60, max: 5 },
			'/reset-password': { window: 60, max: 5 },
			'/forget-password': { window: 60, max: 5 },
			'/change-password': { window: 60, max: 5 },
			'/delete-user': { window: 60, max: 3 },
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // Update session every day
	},

	databaseHooks: {
		user: {
			create: {
				// Every signUpEmail always gets a CustomerProfile here — including
				// the admin/CLI-provisioned flow (AdminStoreMembersController,
				// scripts/create-store-owner.ts, scripts/promote-platform-admin.ts),
				// which deletes it right back out immediately after. That flag used
				// to live as a `isAdminProvisioned` additionalField, but Better
				// Auth's `input` option only gates client-side HTTP requests, not
				// direct auth.api.signUpEmail() calls — so it was a body field any
				// public signup could set to skip its own CustomerProfile creation.
				// Deleting after the fact needs no such flag and can't be spoofed
				// from the outside.
				after: async (user) => {
					await prisma.customerProfile.upsert({
						where: { userId: user.id },
						create: { userId: user.id },
						update: {},
					})
				},
			},
		},
	},
})
