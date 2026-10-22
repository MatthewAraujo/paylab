import { PrismaService } from '@/infra/database/prisma.service'
import { INestApplication } from '@nestjs/common'
import { buildTestApp } from './app'

// A pool wide enough that every parallel request really holds its own connection, so the
// database (not Prisma's pool queue) decides who wins a race.
export const POOL_SIZE = 32

export function widePoolUrl(): string {
	const url = new URL(process.env.DATABASE_URL as string)
	url.searchParams.set('connection_limit', String(POOL_SIZE))
	url.searchParams.set('pool_timeout', '60')
	return url.toString()
}

// The real app on a wide pool, already listening: supertest would otherwise start and close
// its own server per request, resetting the connections of parallel requests.
export async function buildListeningApp(): Promise<INestApplication> {
	const app = await buildTestApp({
		configure: (builder) =>
			builder
				.overrideProvider(PrismaService)
				.useFactory({ factory: () => new PrismaService({ datasourceUrl: widePoolUrl() }) }),
	})
	await app.listen(0)
	return app
}

/** Starts `count` calls at once and waits for all of them. */
export function inParallel<T>(count: number, call: (index: number) => Promise<T>): Promise<T[]> {
	return Promise.all(Array.from({ length: count }, (_, index) => call(index)))
}
