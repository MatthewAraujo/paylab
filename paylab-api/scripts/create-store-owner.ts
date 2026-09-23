import { randomBytes } from 'node:crypto'
import { PrismaClient, StoreMembershipRole } from '@prisma/client'
import { auth } from '../src/infra/better-auth/better-auth'

const prisma = new PrismaClient()

const PROVISIONED_BY = 'cli:create-store-owner'

/**
 * CLI to onboard a new store owner: creates the Better Auth user first if it
 * doesn't exist yet, then links them to a store as StoreMember(OWNER).
 * PlatformAdmin is intentionally never granted here — that's a separate,
 * cross-store role handled by scripts/promote-platform-admin.ts.
 *
 * Usage: npx ts-node scripts/create-store-owner.ts <email> <storeSlug>
 */
async function main() {
	const email = process.argv[2]
	const storeSlug = process.argv[3]

	if (!email || !storeSlug) {
		console.error('Usage: npx ts-node scripts/create-store-owner.ts <email> <storeSlug>')
		process.exitCode = 1
		return
	}

	const store = await prisma.store.findUnique({ where: { slug: storeSlug } })

	if (!store) {
		console.error(`Store with slug "${storeSlug}" not found.`)
		process.exitCode = 1
		return
	}

	const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
		'SELECT id FROM "user" WHERE email = $1',
		email,
	)

	let userId: string

	if (existing.length > 0) {
		userId = existing[0].id
		console.log(`Found existing Better Auth user ${userId} for ${email}.`)
	} else {
		const tempPassword = randomBytes(16).toString('hex')
		const response = await auth.api.signUpEmail({
			body: {
				email,
				password: tempPassword,
				name: email.split('@')[0],
			},
		})
		userId = response.user.id
		console.log(`Created Better Auth user ${userId} for ${email}.`)

		// signUpEmail's create hook always provisions a CustomerProfile — not
		// wanted here, since this account is being provisioned as staff.
		await prisma.customerProfile.deleteMany({ where: { userId } })

		const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
		await auth.api.requestPasswordReset({
			body: {
				email,
				redirectTo: `${frontendUrl}/reset-password`,
			},
		})
		console.log(`Sent a "set your password" email to ${email}.`)
	}

	const existingMembership = await prisma.storeMember.findUnique({
		where: { userId_storeId: { userId, storeId: store.id } },
	})

	if (existingMembership) {
		console.log(
			`${email} is already a member of "${store.name}" (role: ${existingMembership.role}).`,
		)
	} else {
		await prisma.storeMember.create({
			data: { userId, storeId: store.id, role: StoreMembershipRole.OWNER },
		})
		console.log(`${email} is now the owner of "${store.name}".`)
	}

	await prisma.storeMemberProvisioningLog.create({
		data: {
			storeId: store.id,
			createdUserId: userId,
			createdEmail: email,
			createdByUserId: PROVISIONED_BY,
			createdByEmail: PROVISIONED_BY,
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
