import { PrismaService } from '@/infra/database/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma, type SimulationScenario } from '@prisma/client'
import type { Outcome } from './outcome'
import type { RegisterScenarioBody } from './scenario.schemas'

/** The scenario values one consumed attempt applies. */
export interface ConsumedScenario {
	outcome: Outcome
	delayMs: number
	failureCode: string | null
	retryAfterSeconds: number | null
}

@Injectable()
export class SimulationScenarioRepository {
	constructor(private readonly prisma: PrismaService) {}

	/** AC-13: one scenario per (Client, External Reference); registering again replaces it. */
	register(clientId: string, body: RegisterScenarioBody): Promise<SimulationScenario> {
		const now = new Date()
		const values = {
			outcome: body.outcome,
			delayMs: body.delayMs,
			failureCode: body.failureCode ?? null,
			retryAfterSeconds: body.retryAfterSeconds ?? null,
			remainingAttempts: body.times,
			updatedAt: now,
		}
		return this.prisma.simulationScenario.upsert({
			where: {
				clientId_externalReference: { clientId, externalReference: body.externalReference },
			},
			create: { clientId, externalReference: body.externalReference, createdAt: now, ...values },
			update: values,
		})
	}

	/**
	 * Consumes one attempt of the Client's scenario for the External Reference when it has
	 * attempts left and its Outcome is one of `outcomes`, and returns what to apply; `null` when
	 * none applies. One conditional statement (`remaining_attempts > 0`), so parallel attempts
	 * never share one (AC-22). Runs in the caller's database transaction (`db`), so a rollback
	 * (e.g. an Idempotency Key conflict) gives the attempt back.
	 */
	async consumeAttempt(
		db: Prisma.TransactionClient,
		clientId: string,
		externalReference: string,
		outcomes: readonly Outcome[],
	): Promise<ConsumedScenario | null> {
		const rows = await db.$queryRaw<ConsumedScenario[]>`
			UPDATE "simulation_scenario"
			SET "remaining_attempts" = "remaining_attempts" - 1, "updated_at" = ${new Date()}
			WHERE "client_id" = ${clientId}
				AND "external_reference" = ${externalReference}
				AND "remaining_attempts" > 0
				AND "outcome" IN (${Prisma.join(outcomes)})
			RETURNING
				"outcome",
				"delay_ms" AS "delayMs",
				"failure_code" AS "failureCode",
				"retry_after_seconds" AS "retryAfterSeconds"`
		return rows[0] ?? null
	}
}
