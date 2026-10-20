import { defineConfig } from 'vitest/config'
import { databaseTestConfig, sharedConfig } from './vitest.config.shared'

// Integration layer: real PostgreSQL through Testcontainers (schema, triggers, SQL).
export default defineConfig({
	...sharedConfig,
	test: {
		...databaseTestConfig,
		include: ['test/integration/**/*.spec.ts'],
		passWithNoTests: true,
	},
})
