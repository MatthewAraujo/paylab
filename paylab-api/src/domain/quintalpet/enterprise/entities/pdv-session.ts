import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { PdvSessionAlreadyOpenError } from '../errors/pdv-session-already-open-error'
import { SaleDraftNotEmptyError } from '../errors/sale-draft-not-empty-error'
import { StalePdvSessionRequiresConfirmationError } from '../errors/stale-pdv-session-requires-confirmation-error'
import { isSameStoreLocalDay } from '../services/get-store-local-date'
import { PdvSessionStatus } from '../types/pdv-session-status'

export interface PdvSessionProps {
	storeId: UniqueEntityID
	openedByUserId: string
	status: PdvSessionStatus
	openedAt: Date
	closedAt?: Date | null
}

export interface OpenPdvSessionInput {
	storeId: UniqueEntityID
	openedByUserId: string
	/** Store.timezone — the "Organization Date" this open decision is judged against, never UTC/server time. */
	storeTimezone: string
	/** The store's currently OPEN session, if any — looked up by the use case (T5), the entity never queries for it. */
	existingOpenSession?: PdvSession | null
	/** Explicit operator confirmation to close a Stale PDV Session (ADR 0005) and replace it. */
	confirmStaleSessionReplacement?: boolean
	now?: Date
}

export interface OpenPdvSessionResult {
	session: PdvSession
	/** The prior session, now closed as part of this open, when a stale-session replacement happened. */
	replacedStaleSession: PdvSession | null
}

export class PdvSession extends Entity<PdvSessionProps> {
	get storeId() {
		return this.props.storeId
	}

	get openedByUserId() {
		return this.props.openedByUserId
	}

	get status() {
		return this.props.status
	}

	get openedAt() {
		return this.props.openedAt
	}

	get closedAt() {
		return this.props.closedAt ?? null
	}

	get isOpen() {
		return this.props.status === PdvSessionStatus.OPEN
	}

	/**
	 * Closes this session. `activeDraftHasItems` is supplied by the caller
	 * (the use case, per T3/T4) — this entity has no reference to `SaleDraft`
	 * and never queries for it itself.
	 */
	close(activeDraftHasItems: boolean) {
		if (activeDraftHasItems) {
			throw new SaleDraftNotEmptyError()
		}

		this.props.status = PdvSessionStatus.CLOSED
		this.props.closedAt = new Date()
	}

	/**
	 * Force-closes a Stale PDV Session (ADR 0005) as part of an operator-
	 * confirmed replacement at open time. Unlike `close()`, this does not
	 * check for a non-empty active draft — reclaiming a session forgotten
	 * since a prior day is exactly the case that check exists to prevent
	 * accidentally discarding a *current* in-progress sale, which does not
	 * apply to a session that's already a day stale.
	 */
	private forceCloseAsStale() {
		this.props.status = PdvSessionStatus.CLOSED
		this.props.closedAt = new Date()
	}

	static create(props: Optional<PdvSessionProps, 'status' | 'openedAt'>, id?: UniqueEntityID) {
		return new PdvSession(
			{
				...props,
				status: props.status ?? PdvSessionStatus.OPEN,
				openedAt: props.openedAt ?? new Date(),
			},
			id,
		)
	}

	static open(input: OpenPdvSessionInput): OpenPdvSessionResult {
		const now = input.now ?? new Date()
		const { existingOpenSession } = input

		if (existingOpenSession) {
			const isStale = !isSameStoreLocalDay(existingOpenSession.openedAt, now, input.storeTimezone)

			if (!isStale) {
				throw new PdvSessionAlreadyOpenError()
			}

			if (!input.confirmStaleSessionReplacement) {
				throw new StalePdvSessionRequiresConfirmationError()
			}

			existingOpenSession.forceCloseAsStale()
		}

		const session = PdvSession.create({
			storeId: input.storeId,
			openedByUserId: input.openedByUserId,
			status: PdvSessionStatus.OPEN,
			openedAt: now,
		})

		return { session, replacedStaleSession: existingOpenSession ?? null }
	}
}
