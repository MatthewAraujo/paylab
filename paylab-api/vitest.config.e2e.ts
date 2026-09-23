import { fileURLToPath } from 'node:url'
import swc from 'unplugin-swc'
import tsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		fileParallelism: false,
		include: ['test/e2e/**/*.e2e-spec.ts'],
		globals: true,
		root: './',
		setupFiles: ['./test/setup-e2e.ts'],
	},
	plugins: [
		tsConfigPaths(),
		swc.vite({
			module: { type: 'es6' },
		}),
	],
})
