import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { AddItemToSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/add-item-to-sale-draft'
import { CancelSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/cancel-sale-draft'
import { ClosePdvSessionUseCase } from '@/domain/quintalpet/application/use-cases/close-pdv-session'
import { FinalizeSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/finalize-sale-draft'
import { OpenPdvSessionUseCase } from '@/domain/quintalpet/application/use-cases/open-pdv-session'
import { RemoveOrAdjustSaleDraftItemUseCase } from '@/domain/quintalpet/application/use-cases/remove-sale-draft-item'
import { ResolveUnmatchedBarcodeUseCase } from '@/domain/quintalpet/application/use-cases/resolve-unmatched-barcode'
import { StartNewSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/start-new-sale-draft'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { presentOrder } from '@/infra/http/controllers/orders/present-order'
import { presentPdvSession } from '@/infra/http/controllers/pdv/present-pdv-session'
import { presentSaleDraft } from '@/infra/http/controllers/pdv/present-sale-draft'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { PdvCartEvents } from '@/infra/http/gateways/pdv-cart-events.service'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, HttpCode, NotFoundException, Patch, Post } from '@nestjs/common'
import { Session, UserSession } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

const openSessionBodySchema = z.object({
	confirmStaleSessionReplacement: z.boolean().optional(),
})

const addItemBodySchema = z.object({
	variantId: z.string().uuid(),
	quantity: z.number().int().positive().optional(),
})

const adjustItemBodySchema = z.object({
	quantity: z.number().int().positive().optional(),
})

// Same identity invariant as the walk-in order body (orders-admin.controller.ts):
// exactly one of a registered storeCustomerId or a guest name+phone.
const finalizeDraftBodySchema = z
	.object({
		storeCustomerId: z.string().uuid().optional(),
		guestName: z.string().trim().min(1).optional(),
		guestPhone: z.string().trim().min(1).optional(),
		paymentMethod: z.nativeEnum(OrderPaymentMethod),
	})
	.refine((body) => Boolean(body.storeCustomerId) !== Boolean(body.guestName && body.guestPhone), {
		message: 'Provide exactly one of storeCustomerId or both guestName and guestPhone.',
	})

const resolveBarcodeBodySchema = z.object({
	barcode: z.string().trim().min(1),
	variantId: z.string().uuid(),
})

type OpenSessionBody = z.infer<typeof openSessionBodySchema>
type AddItemBody = z.infer<typeof addItemBodySchema>
type AdjustItemBody = z.infer<typeof adjustItemBodySchema>
type FinalizeDraftBody = z.infer<typeof finalizeDraftBodySchema>
type ResolveBarcodeBody = z.infer<typeof resolveBarcodeBodySchema>

/**
 * PDV REST surface (T9): expose the T5-T8 use cases. `storeId` is always
 * resolved from the authenticated StoreMember via `@CurrentStoreId()`, never
 * accepted from the request — a `:id` route param is always a `pdvSessionId`,
 * and every handler acting on one re-derives store scope by looking that
 * session up scoped to the caller's own store first, so a session belonging
 * to a different store is indistinguishable from one that doesn't exist
 * (404), consistent with the rest of this codebase's cross-tenant posture.
 */
@Controller('/api/v1/admin/pdv')
@StoreMemberOnly()
export class PdvAdminController {
	constructor(
		private readonly prisma: PrismaService,
		private readonly pdvSessionsRepository: PdvSessionsRepository,
		private readonly saleDraftsRepository: SaleDraftsRepository,
		private readonly openPdvSessionUseCase: OpenPdvSessionUseCase,
		private readonly closePdvSessionUseCase: ClosePdvSessionUseCase,
		private readonly addItemToSaleDraftUseCase: AddItemToSaleDraftUseCase,
		private readonly removeOrAdjustSaleDraftItemUseCase: RemoveOrAdjustSaleDraftItemUseCase,
		private readonly cancelSaleDraftUseCase: CancelSaleDraftUseCase,
		private readonly finalizeSaleDraftUseCase: FinalizeSaleDraftUseCase,
		private readonly resolveUnmatchedBarcodeUseCase: ResolveUnmatchedBarcodeUseCase,
		private readonly startNewSaleDraftUseCase: StartNewSaleDraftUseCase,
		private readonly cartEvents: PdvCartEvents,
	) {}

	@Post('/sessions')
	@HttpCode(201)
	async open(
		@Session() session: UserSession,
		@CurrentStoreId() storeId: string,
		@Body(new ZodValidationPipe(openSessionBodySchema)) body: OpenSessionBody,
	) {
		try {
			const { session: pdvSession, draft } = await this.openPdvSessionUseCase.execute({
				storeId,
				openedByUserId: session.user.id,
				confirmStaleSessionReplacement: body.confirmStaleSessionReplacement,
			})
			return {
				session: presentPdvSession(pdvSession),
				draft: await presentSaleDraft(this.prisma, draft),
			}
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get('/sessions/current')
	async current(@CurrentStoreId() storeId: string) {
		const pdvSession = await this.pdvSessionsRepository.findOpenByStoreId(storeId)
		if (!pdvSession) {
			return { session: null, draft: null }
		}

		const draft = await this.saleDraftsRepository.findOpenByPdvSessionId(pdvSession.id.toString())

		return {
			session: presentPdvSession(pdvSession),
			draft: draft ? await presentSaleDraft(this.prisma, draft) : null,
		}
	}

	@Post('/sessions/:id/draft/items')
	@HttpCode(201)
	async addItem(
		@CurrentStoreId() storeId: string,
		@UuidParam('id') pdvSessionId: string,
		@Body(new ZodValidationPipe(addItemBodySchema)) body: AddItemBody,
	) {
		await this.assertSessionAccess(storeId, pdvSessionId)

		try {
			const draft = await this.addItemToSaleDraftUseCase.execute({
				pdvSessionId,
				variantId: body.variantId,
				quantity: body.quantity,
			})
			this.cartEvents.emitCartUpdated(pdvSessionId)
			return presentSaleDraft(this.prisma, draft)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Patch('/sessions/:id/draft/items/:variantId')
	async adjustItem(
		@CurrentStoreId() storeId: string,
		@UuidParam('id') pdvSessionId: string,
		@UuidParam('variantId') variantId: string,
		@Body(new ZodValidationPipe(adjustItemBodySchema)) body: AdjustItemBody,
	) {
		await this.assertSessionAccess(storeId, pdvSessionId)

		try {
			const draft = await this.removeOrAdjustSaleDraftItemUseCase.execute({
				pdvSessionId,
				variantId,
				quantity: body.quantity,
			})
			this.cartEvents.emitCartUpdated(pdvSessionId)
			return presentSaleDraft(this.prisma, draft)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/sessions/:id/draft/cancel')
	@HttpCode(200)
	async cancelDraft(@CurrentStoreId() storeId: string, @UuidParam('id') pdvSessionId: string) {
		await this.assertSessionAccess(storeId, pdvSessionId)

		try {
			const draft = await this.cancelSaleDraftUseCase.execute({ pdvSessionId })
			this.cartEvents.emitCartUpdated(pdvSessionId)
			return presentSaleDraft(this.prisma, draft)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	/**
	 * Starts a fresh, empty SaleDraft under a session that has none active —
	 * the explicit "start a new sale" action for the gap CancelSaleDraftUseCase
	 * (T6) deliberately leaves open: cancel does not auto-open a replacement
	 * draft (unlike finalize, US-20), so this is the only way back to "an
	 * active draft exists" without closing and reopening the whole session.
	 * 409 when a draft is already active — see SaleDraftAlreadyActiveError.
	 */
	@Post('/sessions/:id/draft')
	@HttpCode(201)
	async startNewDraft(@CurrentStoreId() storeId: string, @UuidParam('id') pdvSessionId: string) {
		await this.assertSessionAccess(storeId, pdvSessionId)

		try {
			const draft = await this.startNewSaleDraftUseCase.execute({ pdvSessionId })
			this.cartEvents.emitCartUpdated(pdvSessionId)
			return presentSaleDraft(this.prisma, draft)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/sessions/:id/draft/finalize')
	@HttpCode(201)
	async finalizeDraft(
		@CurrentStoreId() storeId: string,
		@UuidParam('id') pdvSessionId: string,
		@Body(new ZodValidationPipe(finalizeDraftBodySchema)) body: FinalizeDraftBody,
	) {
		await this.assertSessionAccess(storeId, pdvSessionId)

		try {
			const activeDraftBeforeFinalize = await this.prisma.saleDraft.findFirst({
				where: { pdvSessionId, status: 'OPEN' },
				select: { unmatchedBarcodes: true },
			})
			const unmatchedBarcodes = Array.isArray(activeDraftBeforeFinalize?.unmatchedBarcodes)
				? activeDraftBeforeFinalize.unmatchedBarcodes.filter(
						(value): value is string => typeof value === 'string',
					)
				: []

			const order = await this.finalizeSaleDraftUseCase.execute({
				pdvSessionId,
				paymentMethod: body.paymentMethod,
				storeCustomerId: body.storeCustomerId,
				guestName: body.guestName,
				guestPhone: body.guestPhone,
			})
			// Finalize also auto-opens a fresh empty draft under the same session
			// (US-20) — broadcasting here shows the emptied cart the instant the
			// sale finalizes (US-21), not just the finalized order response.
			this.cartEvents.emitCartUpdated(pdvSessionId)
			return {
				order: presentOrder(order),
				unmatchedBarcodes,
			}
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/sessions/:id/unmatched-barcodes/resolve')
	@HttpCode(200)
	async resolveUnmatchedBarcode(
		@CurrentStoreId() storeId: string,
		@UuidParam('id') pdvSessionId: string,
		@Body(new ZodValidationPipe(resolveBarcodeBodySchema)) body: ResolveBarcodeBody,
	) {
		await this.assertSessionAccess(storeId, pdvSessionId)

		const targetDraft = await this.findDraftWithUnmatchedBarcode(pdvSessionId, body.barcode)
		if (!targetDraft) {
			throw new NotFoundException('This barcode is not an unmatched barcode for this session.')
		}

		try {
			await this.resolveUnmatchedBarcodeUseCase.execute({
				saleDraftId: targetDraft.id,
				barcode: body.barcode,
				variantId: body.variantId,
			})
			return { resolved: true }
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/sessions/:id/close')
	@HttpCode(200)
	async close(@CurrentStoreId() storeId: string, @UuidParam('id') pdvSessionId: string) {
		try {
			const pdvSession = await this.closePdvSessionUseCase.execute({ storeId, pdvSessionId })
			return presentPdvSession(pdvSession)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	/**
	 * Re-derives store scope for every `:id`-scoped route: a session that
	 * doesn't belong to the caller's own store is indistinguishable from one
	 * that doesn't exist. `PdvSessionsRepository.findById` already filters by
	 * both id and storeId (T4), so this is the same guard ClosePdvSessionUseCase
	 * (T5) gets for free from its own repository call.
	 */
	private async assertSessionAccess(storeId: string, pdvSessionId: string): Promise<PdvSession> {
		const session = await this.pdvSessionsRepository.findById(pdvSessionId, storeId)
		if (!session) {
			throw new NotFoundException('PDV session not found.')
		}
		return session
	}

	/**
	 * unmatched-barcodes/resolve is scoped by pdvSessionId in the URL, but
	 * T8's use case operates on a specific saleDraftId (a session accumulates
	 * many COMPLETED drafts over a day). Searches this session's drafts in
	 * memory rather than a Prisma JSON `array_contains` filter — the per-
	 * session draft count is small and this keeps the query surface simple.
	 */
	private async findDraftWithUnmatchedBarcode(pdvSessionId: string, barcode: string) {
		const drafts = await this.prisma.saleDraft.findMany({ where: { pdvSessionId } })
		return drafts.find((draft) => {
			const unmatchedBarcodes = draft.unmatchedBarcodes as unknown
			return Array.isArray(unmatchedBarcodes) && unmatchedBarcodes.includes(barcode)
		})
	}
}
