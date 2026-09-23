import { EventEmitter } from 'node:events'
import { Injectable } from '@nestjs/common'

export interface CartUpdatedEvent {
	pdvSessionId: string
}

const CART_UPDATED = 'cart:updated'

/**
 * Internal, transport-agnostic event bus for "this PdvSession's SaleDraft
 * changed." Both the REST controller (T9, after add/remove/cancel/finalize/
 * resolve-barcode) and the WS gateway's own `scanner:scan` handler (T10)
 * call `emitCartUpdated` after a mutation succeeds; the gateway is the only
 * subscriber, and re-broadcasts `cart:updated` to the session's room.
 *
 * This is the single shared place T10's implementation notes call for: REST-
 * originated and WS-originated changes can never drift out of sync in what
 * they broadcast, since both paths funnel through the exact same emit call
 * and the gateway's single subscription re-reads the draft fresh before
 * broadcasting. Deliberately a plain Node `EventEmitter`, not
 * `@nestjs/event-emitter` — no new package needed for a single in-process
 * event with one subscriber.
 */
@Injectable()
export class PdvCartEvents {
	private readonly emitter = new EventEmitter()

	emitCartUpdated(pdvSessionId: string): void {
		this.emitter.emit(CART_UPDATED, { pdvSessionId } satisfies CartUpdatedEvent)
	}

	onCartUpdated(listener: (event: CartUpdatedEvent) => void): void {
		this.emitter.on(CART_UPDATED, listener)
	}
}
