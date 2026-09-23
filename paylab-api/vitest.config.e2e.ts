import { defineConfig } from 'vitest/config'
import { databaseTestConfig, sharedConfig } from './vitest.config.shared'

// E2E layer: the HTTP API against the Testcontainers database (the main seam).
export default defineConfig({
	...sharedConfig,
	test: {
		...databaseTestConfig,
		include: ['test/e2e/**/*.e2e-spec.ts'],
		setupFiles: ['./test/support/setup-env.ts', './test/support/setup-database.ts'],
	},
})
