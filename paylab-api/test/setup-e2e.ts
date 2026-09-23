process.env.APP_NAME ??= 'quintal-agro-pet'
process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '3333'
process.env.RESEND_API_KEY ??= 're_test_dummy_key'
process.env.EMAIL_FROM ??= 'Quintal Agro Pet <test@quintal.test>'
// Most specs avoid the real signUpEmail/password-reset HTTP paths entirely
// (see support/better-auth.ts), but any spec that does hit them should never
// make a live network call to Resend with the dummy key above.
process.env.DISABLE_TRANSACTIONAL_EMAILS ??= 'true'
process.env.BETTER_AUTH_SECRET ??= 'test-better-auth-secret-not-for-production-use-only'
process.env.BETTER_AUTH_URL ??= 'http://localhost:3333'
process.env.FRONTEND_URL ??= 'http://localhost:3000'
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'
