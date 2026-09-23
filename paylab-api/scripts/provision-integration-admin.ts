import { randomUUID } from 'node:crypto'
import { PrismaClient, StoreMembershipRole } from '@prisma/client'
import { hashPassword } from 'better-auth/crypto'

const prisma = new PrismaClient()

async function main() {
	const email = process.argv[2]
	const password = process.argv[3]
	const storeSlug = process.argv[4] ?? 'quintal-agro-pet'

	if (!email || !password) {
		console.error(
			'Usage: pnpm ts-node -r tsconfig-paths/register scripts/provision-integration-admin.ts <email> <password> [storeSlug]',
		)
		process.exitCode = 1
		return
	}

	const store = await prisma.store.findUnique({ where: { slug: storeSlug } })

	if (!store) {
		throw new Error(`Store with slug "${storeSlug}" not found.`)
	}

	const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
		'SELECT id FROM "user" WHERE email = $1',
		email,
	)

	let userId = existing[0]?.id

	if (!userId) {
		userId = randomUUID()
		const now = new Date()
		const passwordHash = await hashPassword(password)

		await prisma.$executeRaw`
			INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
			VALUES (${userId}, ${'Integration Admin'}, ${email}, true, ${now}, ${now})
		`

		await prisma.$executeRaw`
			INSERT INTO "account" (id, "accountId", "providerId", "issuer", "userId", password, "createdAt", "updatedAt")
			VALUES (${randomUUID()}, ${userId}, 'credential', 'local:credential', ${userId}, ${passwordHash}, ${now}, ${now})
		`
	}

	await prisma.customerProfile.deleteMany({ where: { userId } })

	await prisma.storeMember.upsert({
		where: {
			userId_storeId: {
				userId,
				storeId: store.id,
			},
		},
		update: {
			role: StoreMembershipRole.OWNER,
		},
		create: {
			userId,
			storeId: store.id,
			role: StoreMembershipRole.OWNER,
		},
	})
}

main()
	.catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
