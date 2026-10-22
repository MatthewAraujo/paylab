import { INestApplication } from '@nestjs/common'
import { vi } from 'vitest'
import type { BuildTestAppOptions } from './app'

/**
 * Boots the real application from a fresh module registry with `env` applied: the configuration
 * (and which modules exist, such as the lab) is resolved when AppModule is first imported, so a
 * test of another environment cannot reuse the already-imported one. `undefined` unsets a
 * variable. The environment is restored once the boot settles; the caller closes the app.
 */
export async function bootWithEnv(
	env: Record<string, string | undefined>,
	options: BuildTestAppOptions = {},
): Promise<INestApplication> {
	const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
	applyEnv(env)
	try {
		vi.resetModules()
		const { buildTestApp } = await import('./app')
		return await buildTestApp(options)
	} finally {
		applyEnv(saved)
		vi.resetModules()
	}
}

function applyEnv(env: Record<string, string | undefined>) {
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) Reflect.deleteProperty(process.env, key)
		else process.env[key] = value
	}
}
