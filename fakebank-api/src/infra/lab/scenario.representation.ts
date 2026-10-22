import { OUTCOMES } from '@/infra/scenarios/outcome'
import { MAX_DELAY_MS } from '@/infra/scenarios/scenario.schemas'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { SimulationScenario } from '@prisma/client'

/** Documentation-only shape of the registration request; runtime validation is the Zod schema. */
export class RegisterScenarioRequest {
	@ApiProperty({ minLength: 1, maxLength: 128, example: 'payment-123' })
	externalReference!: string

	@ApiProperty({ enum: OUTCOMES })
	outcome!: string

	@ApiPropertyOptional({
		minimum: 0,
		maximum: MAX_DELAY_MS,
		default: 0,
		description: 'Wait after persisting, before answering.',
	})
	delayMs?: number

	@ApiPropertyOptional({
		example: 'INSUFFICIENT_FUNDS',
		maxLength: 64,
		description: 'Required for FAIL; refused for every other Outcome.',
	})
	failureCode?: string

	@ApiPropertyOptional({
		minimum: 1,
		maximum: 3600,
		description: 'Only for RATE_LIMIT; the Retry-After header (default 1).',
	})
	retryAfterSeconds?: number

	@ApiPropertyOptional({
		minimum: 1,
		maximum: 100,
		default: 1,
		description: 'How many next attempts carrying the External Reference it affects.',
	})
	times?: number
}

/** The registered scenario; `times` is the number of attempts it will affect. */
export class ScenarioResponse {
	@ApiProperty({ example: 'payment-123' })
	externalReference!: string

	@ApiProperty({ enum: OUTCOMES })
	outcome!: string

	@ApiProperty({ example: 0 })
	delayMs!: number

	@ApiProperty({ type: String, nullable: true, example: 'INSUFFICIENT_FUNDS' })
	failureCode!: string | null

	@ApiProperty({ type: Number, nullable: true, example: null })
	retryAfterSeconds!: number | null

	@ApiProperty({ example: 1 })
	times!: number
}

export function toScenarioResponse(row: SimulationScenario): ScenarioResponse {
	return {
		externalReference: row.externalReference,
		outcome: row.outcome,
		delayMs: row.delayMs,
		failureCode: row.failureCode,
		retryAfterSeconds: row.retryAfterSeconds,
		times: row.remainingAttempts,
	}
}
