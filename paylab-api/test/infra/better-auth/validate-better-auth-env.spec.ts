import { validateBetterAuthEnv } from '@/infra/better-auth/validate-better-auth-env'
import { afterEach, describe, expect, test, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function setBaseEnv(overrides: Record<string, string | undefined> = {}) {
	process.env = {
		...ORIGINAL_ENV,
		BETTER_AUTH_SECRET: 'test-better-auth-secret-not-for-production-use-only',
		BETTER_AUTH_URL: 'http://localhost:3333',
		DATABASE_URL: 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public',
		FRONTEND_URL: 'http://localhost:3000',
		NODE_ENV: 'development',
		DISABLE_TRANSACTIONAL_EMAILS: 'false',
		RESEND_API_KEY: 're_test_dummy_key',
		EMAIL_FROM: 'Quintal Agro Pet <test@quintal.test>',
		COOKIE_DOMAIN: undefined,
		GOOGLE_CLIENT_ID: undefined,
		GOOGLE_CLIENT_SECRET: undefined,
		GOOGLE_REDIRECT_URI: undefined,
		...overrides,
	}
}

describe('validateBetterAuthEnv', () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV }
		vi.restoreAllMocks()
	})

	test('accepts Google OAuth config with an explicit redirect URI', () => {
		setBaseEnv({
			GOOGLE_CLIENT_ID: 'google-client-id',
			GOOGLE_CLIENT_SECRET: 'google-client-secret',
			GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/callback/google',
		})

		expect(validateBetterAuthEnv()).toMatchObject({
			GOOGLE_CLIENT_ID: 'google-client-id',
			GOOGLE_CLIENT_SECRET: 'google-client-secret',
			GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/callback/google',
		})
	})

	test('rejects partial Google OAuth configuration', () => {
		setBaseEnv({
			GOOGLE_CLIENT_ID: 'google-client-id',
		})

		expect(() => validateBetterAuthEnv()).toThrowError(/GOOGLE_CLIENT_SECRET/)
	})

	test('allows startup without Resend credentials when transactional emails are disabled', () => {
		setBaseEnv({
			DISABLE_TRANSACTIONAL_EMAILS: 'true',
			RESEND_API_KEY: undefined,
			EMAIL_FROM: undefined,
		})

		expect(validateBetterAuthEnv()).toMatchObject({
			DISABLE_TRANSACTIONAL_EMAILS: 'true',
		})
	})
})
