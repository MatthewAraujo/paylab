import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import {
	CreateWalkInOrderUseCase,
	WalkInOrderItemInput,
} from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { EmptySaleDraftError } from './errors/empty-sale-draft-error'

export interface FinalizeSaleDraftInput {
	pdvSessionId: string
	paymentMethod: OrderPaymentMethod
	storeCustomerId?: string
	guestName?: string
	guestPhone?: string
}

/**
 * Turns the active SaleDraft into a real Order by delegating to the existing
 * CreateWalkInOrderUseCase unmodified (ADR 0003) — this use case never
 * duplicates its transaction, inventory-decrement, or order-code-generation
 * logic, it only builds WalkInOrderItemInput[] from the draft's line items
 * and hands off.
 *
 * Draft completion and next-draft creation only happen after
 * CreateWalkInOrderUseCase succeeds. Its own internal transaction already
 * rolls back atomically on failure (e.g. OrderItemUnavailableError for
 * insufficient stock), so a thrown error here always leaves this draft
 * exactly as it was, OPEN, for the operator to adjust and retry (US-26's
 * "stock only checked at finalize" contract playing out at the one place
 * stock does get checked).
 */
@Injectable()
export class FinalizeSaleDraftUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly saleDraftsRepository: SaleDraftsRepository,
		private readonly storesRepository: StoresRepository,
		private readonly createWalkInOrderUseCase: CreateWalkInOrderUseCase,
	) {}

	async execute(input: FinalizeSaleDraftInput): Promise<Order> {
		const session = await this.prisma.pdvSession.findUnique({
			where: { id: input.pdvSessionId },
			select: { storeId: true },
		})
		if (!session) {
			throw new NotFoundException('PDV session not found.')
		}

		const draft = await this.saleDraftsRepository.findOpenByPdvSessionId(input.pdvSessionId)
		if (!draft) {
			throw new NotFoundException('No active sale draft for this PDV session.')
		}

		if (draft.isEmpty) {
			throw new EmptySaleDraftError()
		}

		const store = await this.storesRepository.findById(session.storeId)
		if (!store) {
			throw new NotFoundException('Store not found.')
		}

		const items: WalkInOrderItemInput[] = draft.items.map((item) => ({
			variantId: item.variantId.toString(),
			quantity: item.quantity,
		}))

		const order = await this.createWalkInOrderUseCase.execute(store.id, store.slug, {
			items,
			paymentMethod: input.paymentMethod,
			storeCustomerId: input.storeCustomerId,
			guestName: input.guestName,
			guestPhone: input.guestPhone,
		})

		draft.complete()
		const nextDraft = SaleDraft.create({ pdvSessionId: draft.pdvSessionId })

		await this.prisma.$transaction(async (tx) => {
			await this.saleDraftsRepository.save(draft, tx)
			await this.saleDraftsRepository.save(nextDraft, tx)
		})

		return order
	}
}
