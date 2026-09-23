import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

export interface OpenPdvSessionInput {
	storeId: string
	openedByUserId: string
	/** Explicit operator confirmation to close a Stale PDV Session (ADR 0005) and replace it. */
	confirmStaleSessionReplacement?: boolean
}

export interface OpenPdvSessionOutput {
	session: PdvSession
	draft: SaleDraft
}

/**
 * Opens a PdvSession for a store and, in the same step, its first empty
 * SaleDraft (PRD: "register open" and "cart ready" are one step, not two).
 * `PdvSession.open()` (T2) decides whether this is allowed given the store's
 * currently OPEN session, if any; this use case looks that fact up and
 * persists the result. The DB's partial unique index (T1) is the actual
 * concurrency guard — a losing concurrent call surfaces here as a unique
 * constraint violation, translated back into the same domain error the
 * entity would have thrown had it seen the winner's session first.
 */
@Injectable()
export class OpenPdvSessionUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly pdvSessionsRepository: PdvSessionsRepository,
		private readonly saleDraftsRepository: SaleDraftsRepository,
		private readonly storesRepository: StoresRepository,
	) {}

	async execute(input: OpenPdvSessionInput): Promise<OpenPdvSessionOutput> {
		const store = await this.storesRepository.findById(input.storeId)
		if (!store) {
			throw new NotFoundException('Store not found.')
		}

		const existingOpenSession = await this.pdvSessionsRepository.findOpenByStoreId(input.storeId)

		const { session, replacedStaleSession } = PdvSession.open({
			storeId: new UniqueEntityID(input.storeId),
			openedByUserId: input.openedByUserId,
			storeTimezone: store.timezone,
			existingOpenSession,
			confirmStaleSessionReplacement: input.confirmStaleSessionReplacement,
		})

		const draft = SaleDraft.create({ pdvSessionId: session.id })

		try {
			await this.prisma.$transaction(async (tx) => {
				if (replacedStaleSession) {
					await this.pdvSessionsRepository.save(replacedStaleSession, tx)
				}
				await this.pdvSessionsRepository.save(session, tx)
				await this.saleDraftsRepository.save(draft, tx)
			})
		} catch (error) {
			if (this.isUniqueConstraintViolation(error)) {
				throw new PdvSessionAlreadyOpenError()
			}
			throw error
		}

		return { session, draft }
	}

	private isUniqueConstraintViolation(error: unknown): boolean {
		// Postgres unique_violation surfaces through Prisma as P2002 — this is
		// what the T1 partial unique index throws when a concurrent open loses
		// the race after this use case already decided it was safe to proceed.
		return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
	}
}
