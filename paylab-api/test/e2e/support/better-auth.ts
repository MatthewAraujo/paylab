import { randomUUID } from 'node:crypto'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { hashPassword } from 'better-auth/crypto'
import request from 'supertest'

export const BETTER_AUTH_TEST_PASSWORD = 'password123'

interface CreateBetterAuthUserInput {
	name?: string
	email?: string
	password?: string
}

/**
 * Inserts directly into the native `user`/`account` tables (outside Prisma's
 * schema) instead of calling `auth.api.signUpEmail`, to avoid firing the
 * verification-email side effect on every test. `hashPassword` is Better
 * Auth's own hasher, so `POST /api/auth/sign-in/email` accepts it as-is.
 * The `issuer` column is required by the installed better-auth version.
 */
export async function createBetterAuthUser(
	prisma: PrismaService,
	input?: CreateBetterAuthUserInput,
) {
	const suffix = Math.random().toString(36).slice(2, 10)
	const userId = randomUUID()
	const now = new Date()
	const email = input?.email ?? `user-${suffix}@quintal.test`
	const name = input?.name ?? 'Test User'
	const password = input?.password ?? BETTER_AUTH_TEST_PASSWORD

	await prisma.$executeRaw`
		INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
		VALUES (${userId}, ${name}, ${email}, true, ${now}, ${now})
	`

	const passwordHash = await hashPassword(password)

	await prisma.$executeRaw`
		INSERT INTO "account" (id, "accountId", "providerId", "issuer", "userId", password, "createdAt", "updatedAt")
		VALUES (${randomUUID()}, ${userId}, 'credential', 'local:credential', ${userId}, ${passwordHash}, ${now}, ${now})
	`

	return { id: userId, email, name, password }
}

/**
 * Signs in through the real Better Auth HTTP endpoint and returns the
 * `Set-Cookie` header value to use on subsequent authenticated requests.
 */
export async function signInWithBetterAuth(
	app: INestApplication,
	email: string,
	password: string,
): Promise<string> {
	const response = await request(app.getHttpServer())
		.post('/api/auth/sign-in/email')
		.send({ email, password })

	const setCookie = response.headers['set-cookie']

	if (!setCookie || setCookie.length === 0) {
		throw new Error(`Better Auth sign-in failed: ${JSON.stringify(response.body)}`)
	}

	return Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
}

interface AuthenticateStoreMemberInput extends CreateBetterAuthUserInput {
	storeName?: string
	storeSlug?: string
}

/**
 * Creates a store, a Better Auth user, and a `StoreMember` linking them, then
 * signs in for real to obtain a session cookie for `@StoreMemberOnly()` routes.
 */
export async function authenticateStoreMember(
	app: INestApplication,
	prisma: PrismaService,
	input?: AuthenticateStoreMemberInput,
) {
	const suffix = Math.random().toString(36).slice(2, 10)

	const store = await prisma.store.create({
		data: {
			name: input?.storeName ?? `Store ${suffix}`,
			slug: input?.storeSlug ?? `store-${suffix}`,
		},
	})

	const user = await createBetterAuthUser(prisma, input)

	await prisma.storeMember.create({
		data: {
			userId: user.id,
			storeId: store.id,
			role: 'ADMIN',
		},
	})

	const cookie = await signInWithBetterAuth(app, user.email, user.password)

	return { store, user, cookie }
}

/**
 * Creates a Better Auth user with a `PlatformAdmin` record and signs in to
 * obtain a session cookie for `@PlatformAdminOnly()` routes.
 */
export async function authenticatePlatformAdmin(
	app: INestApplication,
	prisma: PrismaService,
	input?: CreateBetterAuthUserInput,
) {
	const user = await createBetterAuthUser(prisma, input)

	await prisma.platformAdmin.create({ data: { userId: user.id } })

	const cookie = await signInWithBetterAuth(app, user.email, user.password)

	return { user, cookie }
}

/**
 * Creates a Better Auth user with a `CustomerProfile` and signs in to obtain
 * a session cookie for `@CustomerOnly()` routes.
 */
export async function authenticateCustomer(
	app: INestApplication,
	prisma: PrismaService,
	input?: CreateBetterAuthUserInput,
) {
	const user = await createBetterAuthUser(prisma, input)

	await prisma.customerProfile.create({ data: { userId: user.id } })

	const cookie = await signInWithBetterAuth(app, user.email, user.password)

	return { user, cookie }
}

/**
 * Removes the native Better Auth tables' rows. `TRUNCATE ... CASCADE` also
 * clears `account`/`session`, which reference `user` but aren't modeled in
 * Prisma's schema and can't be reached through `prisma.<model>.deleteMany()`.
 */
export async function resetBetterAuthTables(prisma: PrismaService) {
	await prisma.$executeRaw`TRUNCATE TABLE "user" CASCADE`
}
