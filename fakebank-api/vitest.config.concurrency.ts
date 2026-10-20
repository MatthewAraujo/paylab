import { defineConfig } from 'vitest/config'
import { databaseTestConfig, sharedConfig } from './vitest.config.shared'

// Concurrency layer: parallel requests against a real server; kept apart so it
// cannot block the fast gate.
export default defineConfig({
	...sharedConfig,
	test: {
		...databaseTestConfig,
		include: ['test/concurrency/**/*.spec.ts'],
		passWithNoTests: true,
	},
})
