import { buildEnv } from '@/infra/env/env'

// Configuration: the service must refuse to boot half-configured, and say why.
describe('environment configuration', () => {
	it('refuses to boot without DATABASE_URL, naming the missing variable', () => {
		expect(() => buildEnv({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/)
	})

	it('defaults PORT to 4000 so FakeBank never collides with PayLab on 3333', () => {
		const env = buildEnv({ DATABASE_URL: 'postgresql://fakebank:fakebank@localhost:5434/fakebank' })

		expect(env.PORT).toBe(4000)
	})
})
