import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { auth } from '../src/infra/better-auth/better-auth'

const prisma = new PrismaClient()

/**
 * One-off CLI to grant platform-admin access to a Better Auth user, creating
 * the account first if it doesn't exist yet. Not an HTTP endpoint on purpose:
 * the very first platform admin can't be gated behind "must already be a
 * platform admin," so this is meant to be run by hand against the database.
 *
 * Usage: npx ts-node scripts/promote-platform-admin.ts <email>
 */
async function main() {
	const email = process.argv[2]

	if (!email) {
		console.error('Usage: npx ts-node scripts/promote-platform-admin.ts <email>')
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

	await prisma.platformAdmin.upsert({
		where: { userId },
		create: { userId },
		update: {},
	})

	console.log(`${email} is now a platform admin.`)
}

main()
	.catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
