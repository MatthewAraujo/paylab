import { fileURLToPath } from 'node:url'
import swc from 'unplugin-swc'
import tsConfigPaths from 'vite-tsconfig-paths'
import type { UserConfig } from 'vitest/config'

// Shared by every test layer. Database layers add the Testcontainers global
// setup; all layers load the env defaults so a developer `.env` is never read.
export const sharedConfig = {
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	plugins: [
		tsConfigPaths(),
		swc.vite({
			module: { type: 'es6' },
		}),
	],
} satisfies UserConfig

export const databaseTestConfig = {
	// One container per run, serial files: database suites share one database.
	fileParallelism: false,
	globals: true,
	root: './',
	globalSetup: ['./test/support/global-setup.ts'],
	testTimeout: 30_000,
	hookTimeout: 120_000,
} satisfies NonNullable<UserConfig['test']>
