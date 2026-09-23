import { buildEnv } from '@/infra/env/env'

describe('buildEnv', () => {
	test('accepts the Quintal Agro Pet baseline environment with defaults', () => {
		const env = buildEnv({
			DATABASE_URL: 'postgresql://docker:docker@localhost:5432/quintal_agro_pet',
		})

		expect(env).toMatchObject({
			APP_NAME: 'quintal-agro-pet',
			LOG_ENABLED: false,
			LOG_LEVEL: 'basic',
			DATABASE_URL: 'postgresql://docker:docker@localhost:5432/quintal_agro_pet',
			REDIS_HOST: '127.0.0.1',
			REDIS_PORT: 6379,
			REDIS_DB: 0,
			CLOUDFLARE_ACCOUNT_ID: '',
			AWS_ACCESS_KEY_ID: '',
			AWS_SECRET_ACCESS_KEY: '',
			AWS_BUCKET_NAME: '',
			NODE_ENV: 'development',
			PORT: 3333,
		})
	})

	test('rejects a missing database URL', () => {
		expect(() => buildEnv({})).toThrow()
	})

	test('rejects an invalid database URL', () => {
		expect(() => buildEnv({ DATABASE_URL: 'not-a-url' })).toThrow()
	})

	test('accepts structured logging configuration', () => {
		const env = buildEnv({
			DATABASE_URL: 'postgresql://docker:docker@localhost:5432/quintal_agro_pet',
			LOG_ENABLED: 'true',
			LOG_LEVEL: 'debug',
		})

		expect(env).toMatchObject({
			LOG_ENABLED: true,
			LOG_LEVEL: 'debug',
		})
	})
})
