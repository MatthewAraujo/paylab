import { getFrontendOrigin } from '@/infra/http/frontend-origin'

describe('getFrontendOrigin', () => {
	const originalFrontendUrl = process.env.FRONTEND_URL

	afterEach(() => {
		if (originalFrontendUrl === undefined) {
			Reflect.deleteProperty(process.env, 'FRONTEND_URL')
			return
		}

		process.env.FRONTEND_URL = originalFrontendUrl
	})

	test('falls back to localhost when FRONTEND_URL is unset', () => {
		Reflect.deleteProperty(process.env, 'FRONTEND_URL')

		expect(getFrontendOrigin()).toBe('http://localhost:3000')
	})

	test('trims whitespace and trailing slashes from FRONTEND_URL', () => {
		process.env.FRONTEND_URL = ' https://quintal-agropet.com/// '

		expect(getFrontendOrigin()).toBe('https://quintal-agropet.com')
	})
})
