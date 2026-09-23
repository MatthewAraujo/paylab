import { defineConfig } from 'vitest/config'
import { databaseTestConfig, sharedConfig } from './vitest.config.shared'

// Concurrency layer: real parallel connections; kept apart so it cannot block the fast gate.
export default defineConfig({
	...sharedConfig,
	test: {
		...databaseTestConfig,
		include: ['test/concurrency/**/*.spec.ts'],
		setupFiles: ['./test/support/setup-env.ts', './test/support/setup-database.ts'],
	},
})
