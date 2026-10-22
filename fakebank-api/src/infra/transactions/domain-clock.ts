import { randomUUID } from 'node:crypto'
import { DomainClock } from '@/domain/provider-transaction'

/** Injection token of the DomainClock used by the Provider Transaction state machine. */
export const DOMAIN_CLOCK = Symbol('DomainClock')

export const systemClock: DomainClock = {
	now: () => new Date(),
	newEventId: () => randomUUID(),
}
