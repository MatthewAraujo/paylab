import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { InvalidSaleDraftQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-sale-draft-quantity-error'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { SaleDraftItemNotFoundError } from '@/domain/quintalpet/enterprise/errors/sale-draft-item-not-found-error'
import { SaleDraftNotEmptyError } from '@/domain/quintalpet/enterprise/errors/sale-draft-not-empty-error'
import { StalePdvSessionRequiresConfirmationError } from '@/domain/quintalpet/enterprise/errors/stale-pdv-session-requires-confirmation-error'
import { PdvSessionStatus } from '@/domain/quintalpet/enterprise/types/pdv-session-status'
import { SaleDraftStatus } from '@/domain/quintalpet/enterprise/types/sale-draft-status'

const STORE_TIMEZONE = 'America/Sao_Paulo'

function createExistingSession(openedAt: Date) {
	return PdvSession.create({
		storeId: new UniqueEntityID('store-1'),
		openedByUserId: 'user-1',
		status: PdvSessionStatus.OPEN,
		openedAt,
	})
}

describe('quintal agro pet PDV domain', () => {
	describe('PdvSession', () => {
		test('opening when no session exists for the store succeeds', () => {
			const { session, replacedStaleSession } = PdvSession.open({
				storeId: new UniqueEntityID('store-1'),
				openedByUserId: 'user-1',
				storeTimezone: STORE_TIMEZONE,
				existingOpenSession: null,
			})

			expect(session.status).toBe(PdvSessionStatus.OPEN)
			expect(session.isOpen).toBe(true)
			expect(replacedStaleSession).toBeNull()
		})

		test('opening when an OPEN session exists from the same store-local day throws PdvSessionAlreadyOpenError', () => {
			// 2026-08-25T12:00:00 in America/Sao_Paulo (UTC-3) is 2026-08-25T15:00:00Z.
			const now = new Date('2026-08-25T15:00:00.000Z')
			const existing = createExistingSession(new Date('2026-08-25T13:00:00.000Z'))

			expect(() =>
				PdvSession.open({
					storeId: new UniqueEntityID('store-1'),
					openedByUserId: 'user-2',
					storeTimezone: STORE_TIMEZONE,
					existingOpenSession: existing,
					now,
				}),
			).toThrow(PdvSessionAlreadyOpenError)
			// The existing session is left untouched.
			expect(existing.isOpen).toBe(true)
		})

		test('opening when an OPEN session exists from a prior store-local day throws a distinguishable stale-session error without confirmation, and succeeds (closing the old one) with confirmation', () => {
			// Existing session opened 2026-08-24T13:00:00 America/Sao_Paulo.
			const existingOpenedAt = new Date('2026-08-24T16:00:00.000Z')
			// "Now" is the next store-local day.
			const now = new Date('2026-08-25T15:00:00.000Z')

			const existingWithoutConfirmation = createExistingSession(existingOpenedAt)
			expect(() =>
				PdvSession.open({
					storeId: new UniqueEntityID('store-1'),
					openedByUserId: 'user-2',
					storeTimezone: STORE_TIMEZONE,
					existingOpenSession: existingWithoutConfirmation,
					now,
				}),
			).toThrow(StalePdvSessionRequiresConfirmationError)
			expect(existingWithoutConfirmation.isOpen).toBe(true)

			const existingWithConfirmation = createExistingSession(existingOpenedAt)
			const { session, replacedStaleSession } = PdvSession.open({
				storeId: new UniqueEntityID('store-1'),
				openedByUserId: 'user-2',
				storeTimezone: STORE_TIMEZONE,
				existingOpenSession: existingWithConfirmation,
				confirmStaleSessionReplacement: true,
				now,
			})

			expect(session.isOpen).toBe(true)
			expect(session.openedByUserId).toBe('user-2')
			expect(replacedStaleSession).toBe(existingWithConfirmation)
			expect(existingWithConfirmation.isOpen).toBe(false)
			expect(existingWithConfirmation.status).toBe(PdvSessionStatus.CLOSED)
			expect(existingWithConfirmation.closedAt).not.toBeNull()
		})

		test('closing succeeds when there is no active draft or the active draft is empty', () => {
			const session = createExistingSession(new Date())

			session.close(false)

			expect(session.status).toBe(PdvSessionStatus.CLOSED)
			expect(session.isOpen).toBe(false)
			expect(session.closedAt).not.toBeNull()
		})

		test('closing throws SaleDraftNotEmptyError when the active draft has at least one item', () => {
			const session = createExistingSession(new Date())

			expect(() => session.close(true)).toThrow(SaleDraftNotEmptyError)
			expect(session.isOpen).toBe(true)
		})
	})

	describe('SaleDraft', () => {
		function createDraft() {
			return SaleDraft.create({ pdvSessionId: new UniqueEntityID('session-1') })
		}

		test('adding a new variantId creates a line with quantity 1', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-1')

			draft.addItem(variantId)

			expect(draft.items).toHaveLength(1)
			expect(draft.items[0].variantId.equals(variantId)).toBe(true)
			expect(draft.items[0].quantity).toBe(1)
		})

		test('adding the same variantId again increments the existing line instead of duplicating it', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-1')

			draft.addItem(variantId)
			draft.addItem(variantId)
			draft.addItem(variantId, 3)

			expect(draft.items).toHaveLength(1)
			expect(draft.items[0].quantity).toBe(5)
		})

		test('removeItem drops a line entirely regardless of its quantity', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-1')
			draft.addItem(variantId, 4)

			draft.removeItem(variantId)

			expect(draft.items).toHaveLength(0)
		})

		test('reduceItemQuantity to exactly 0 also drops the line (never leaves a zero-quantity line)', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-1')
			draft.addItem(variantId, 2)

			draft.reduceItemQuantity(variantId, 2)

			expect(draft.items).toHaveLength(0)
		})

		test('reduceItemQuantity by less than the full amount leaves the line with the reduced quantity', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-1')
			draft.addItem(variantId, 5)

			draft.reduceItemQuantity(variantId, 2)

			expect(draft.items).toHaveLength(1)
			expect(draft.items[0].quantity).toBe(3)
		})

		test('reducing or removing a non-existent line throws SaleDraftItemNotFoundError', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-absent')

			expect(() => draft.reduceItemQuantity(variantId, 1)).toThrow(SaleDraftItemNotFoundError)
			expect(() => draft.removeItem(variantId)).toThrow(SaleDraftItemNotFoundError)
		})

		test('reducing a line below 0 throws InvalidSaleDraftQuantityError and leaves the line untouched', () => {
			const draft = createDraft()
			const variantId = new UniqueEntityID('variant-1')
			draft.addItem(variantId, 2)

			expect(() => draft.reduceItemQuantity(variantId, 3)).toThrow(InvalidSaleDraftQuantityError)
			expect(draft.items).toHaveLength(1)
			expect(draft.items[0].quantity).toBe(2)
		})

		test('cancel() empties all lines and marks the draft CANCELLED', () => {
			const draft = createDraft()
			draft.addItem(new UniqueEntityID('variant-1'))
			draft.addItem(new UniqueEntityID('variant-2'))

			draft.cancel()

			expect(draft.items).toHaveLength(0)
			expect(draft.status).toBe(SaleDraftStatus.CANCELLED)
		})

		test('appending an unmatched barcode adds it; appending the same barcode twice does not duplicate it', () => {
			const draft = createDraft()

			draft.addUnmatchedBarcode('7891234567890')
			draft.addUnmatchedBarcode('7891234567890')
			draft.addUnmatchedBarcode('0000000000000')

			expect(draft.unmatchedBarcodes).toEqual(['7891234567890', '0000000000000'])
		})
	})
})
