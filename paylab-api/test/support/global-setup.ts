import { execFileSync } from 'node:child_process'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string | undefined
	}
}

// One disposable PostgreSQL per test run: start it, build the schema from the
// migrations exactly as production would, hand the URL to the workers, stop it.
export default async function setup(project: TestProject) {
	const container = await new PostgreSqlContainer('postgres:16-alpine')
		.withDatabase('paylab_test')
		.withUsername('paylab')
		.withPassword('paylab')
		.start()
	const databaseUrl = container.getConnectionUri()

	execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: databaseUrl },
		stdio: 'inherit',
	})

	project.provide('databaseUrl', databaseUrl)

	return async () => {
		await container.stop()
	}
}
