import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { Public } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

const checkEmailBodySchema = z.object({
	email: z.string().email(),
})

type CheckEmailBody = z.infer<typeof checkEmailBodySchema>

@Controller('/api/v1/auth/check-email')
@ApiTags('Auth')
@Public()
// Public + reveals account existence by email: without this, it's an
// unthrottled enumeration oracle over every registered user (customers and
// store owners alike). 5 requests/min per IP is generous for a real
// signup form filling in one email at a time, but useless for scanning a list.
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class CheckEmailController {
	constructor(private readonly prisma: PrismaService) {}

	@Post()
	@HttpCode(200)
	@ApiOperation({ summary: 'Check whether an email is already registered' })
	@ApiOkResponse({ description: 'Whether the email already has an account.' })
	async handle(@Body(new ZodValidationPipe(checkEmailBodySchema)) body: CheckEmailBody) {
		// Better Auth's own "user" table isn't modeled in Prisma (it's managed
		// by the Better Auth Kysely adapter directly), so this reads it raw.
		const rows = await this.prisma.$queryRaw<{ id: string }[]>`
			SELECT id FROM "user" WHERE email = ${body.email.toLowerCase()} LIMIT 1
		`

		return { exists: rows.length > 0 }
	}
}
