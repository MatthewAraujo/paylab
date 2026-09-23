import { defineConfig } from 'vitest/config'
import { sharedConfig } from './vitest.config.shared'

// Unit layer: pure specs, no database and no container.
export default defineConfig({
	...sharedConfig,
	test: {
		globals: true,
		include: ['test/**/*.spec.ts'],
		exclude: ['test/integration/**', 'test/concurrency/**', 'test/e2e/**'],
		root: './',
		setupFiles: ['./test/support/setup-env.ts'],
	},
})
