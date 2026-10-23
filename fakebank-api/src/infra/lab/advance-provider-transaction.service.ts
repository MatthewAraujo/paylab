import {
	DomainClock,
	ProviderTransactionStatus,
	ProviderTransactionTransition,
	transitionProviderTransaction,
} from '@/domain/provider-transaction'
import { DOMAIN_CLOCK } from '@/infra/transactions/domain-clock'
import { ProviderTransactionRepository } from '@/infra/transactions/provider-transaction.repository'
import { transactionNotFound } from '@/infra/transactions/transaction-not-found'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { ProviderTransaction } from '@prisma/client'
import { AdvanceBody } from './advance.schemas'

export interface AdvanceProviderTransactionCommand {
	clientId: string
	providerTransactionId: string
	decision: AdvanceBody
}

/**
 * AC-24/AC-25: decides a deferred (PROCESSING) Provider Transaction of the Client. The state
 * machine refuses an already terminal one; the repository's status-guarded update refuses the
 * loser of two concurrent decisions, which is answered exactly like the sequential case.
 */
@Injectable()
export class AdvanceProviderTransactionService {
	constructor(
		private readonly repository: ProviderTransactionRepository,
		@Inject(DOMAIN_CLOCK) private readonly clock: DomainClock,
	) {}

	async execute(command: AdvanceProviderTransactionCommand): Promise<ProviderTransaction> {
		const current = await this.repository.findForClient(
			command.clientId,
			command.providerTransactionId,
		)
		if (!current) {
			throw transactionNotFound()
		}

		const transition = toTransition(command.decision)
		const decided = transitionProviderTransaction(
			{ ...current, status: current.status as ProviderTransactionStatus },
			transition,
			this.clock,
		)
		if (!decided.ok) {
			if (decided.error.code === 'INVALID_TRANSITION') {
				throw invalidTransition(decided.error.from, transition.to)
			}
			// Unreachable while the body schema requires the Failure Code; kept as a 400 anyway.
			throw new HttpException(
				{ code: 'VALIDATION_ERROR', message: 'failureCode: Required for FAILED' },
				HttpStatus.BAD_REQUEST,
			)
		}

		const advanced = await this.repository.applyDecision(command.clientId, decided.value)
		if (!advanced) {
			// A concurrent decision committed first: the row is terminal now.
			throw invalidTransition('PROCESSING', transition.to, 'already decided concurrently')
		}
		return advanced
	}
}

function toTransition(decision: AdvanceBody): ProviderTransactionTransition {
	if (decision.status === 'FAILED') {
		return { to: 'FAILED', failureCode: decision.failureCode ?? '' }
	}
	return { to: 'SUCCEEDED' }
}

function invalidTransition(
	from: ProviderTransactionStatus,
	to: ProviderTransactionStatus,
	detail = `it is ${from}`,
): HttpException {
	return new HttpException(
		{
			code: 'INVALID_TRANSITION',
			message: `The Provider Transaction cannot move to ${to}: ${detail}.`,
		},
		HttpStatus.CONFLICT,
	)
}
