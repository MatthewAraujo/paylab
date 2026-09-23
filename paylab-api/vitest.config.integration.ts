import { defineConfig } from 'vitest/config'
import { databaseTestConfig, sharedConfig } from './vitest.config.shared'

// Integration layer: real PostgreSQL through Testcontainers.
export default defineConfig({
	...sharedConfig,
	test: {
		...databaseTestConfig,
		include: ['test/integration/**/*.spec.ts'],
		setupFiles: ['./test/support/setup-env.ts', './test/support/setup-database.ts'],
	},
})
