import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { AddItemToSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/add-item-to-sale-draft'
import { ResolveVariantByBarcodeUseCase } from '@/domain/quintalpet/application/use-cases/resolve-variant-by-barcode'
import { auth } from '@/infra/better-auth/better-auth'
import { PermissionService } from '@/infra/better-auth/permission.service'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { presentSaleDraft } from '@/infra/http/controllers/pdv/present-sale-draft'
import { getFrontendOrigin } from '@/infra/http/frontend-origin'
import { PdvCartEvents } from '@/infra/http/gateways/pdv-cart-events.service'
import { Logger } from '@nestjs/common'
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsException,
} from '@nestjs/websockets'
import { fromNodeHeaders } from 'better-auth/node'
import { Server, Socket } from 'socket.io'

interface PdvSocketData {
	userId: string
	pdvSessionId?: string
}

type PdvSocket = Socket<
	Record<string, (...args: unknown[]) => void>,
	Record<string, (...args: unknown[]) => void>,
	Record<string, (...args: unknown[]) => void>,
	PdvSocketData
>

function pdvRoom(pdvSessionId: string): string {
	return `pdv:${pdvSessionId}`
}

/**
 * Real-time PDV sync (ADR 0004): one room per PdvSession (`pdv:{sessionId}`).
 * Handshake authorization reuses the exact same Better Auth session-cookie
 * check as the REST guard (T9) — `auth.api.getSession` against the raw
 * handshake headers, no second auth mechanism for the WS layer. Rejection
 * happens in a Socket.IO `server.use` middleware, ahead of `connection`, so
 * an unauthenticated client is refused at the handshake itself (a
 * `connect_error` on the client), not merely on its first message.
 *
 * Contains no cart-mutation logic of its own: `scanner:scan` resolves a
 * barcode (T6's ResolveVariantByBarcodeUseCase) and, on a match, calls
 * AddItemToSaleDraftUseCase (T6) — the same use case the REST manual-add
 * path (T9) calls. Every mutation, regardless of origin, funnels through
 * PdvCartEvents so `cart:updated` is only ever broadcast from one place.
 */
@WebSocketGateway({
	cors: {
		origin: getFrontendOrigin(),
		credentials: true,
	},
})
export class PdvGateway implements OnGatewayInit, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server

	private readonly logger = new Logger(PdvGateway.name)

	constructor(
		private readonly prisma: PrismaService,
		private readonly saleDraftsRepository: SaleDraftsRepository,
		private readonly permissionService: PermissionService,
		private readonly resolveVariantByBarcodeUseCase: ResolveVariantByBarcodeUseCase,
		private readonly addItemToSaleDraftUseCase: AddItemToSaleDraftUseCase,
		private readonly cartEvents: PdvCartEvents,
	) {
		// Single subscription for the whole gateway lifetime: every SaleDraft
		// mutation, whichever use case triggered it (REST controller or this
		// gateway's own scanner:scan handler), re-broadcasts through here.
		this.cartEvents.onCartUpdated(({ pdvSessionId }) => {
			this.broadcastCartUpdated(pdvSessionId).catch((error) => {
				this.logger.error(`Failed to broadcast cart:updated for session ${pdvSessionId}`, error)
			})
		})
	}

	afterInit(server: Server): void {
		server.use(async (socket: PdvSocket, next) => {
			try {
				const session = await auth.api.getSession({
					headers: fromNodeHeaders(socket.handshake.headers),
				})

				if (!session) {
					next(new Error('UNAUTHORIZED'))
					return
				}

				socket.data.userId = session.user.id
				next()
			} catch {
				next(new Error('UNAUTHORIZED'))
			}
		})
	}

	handleDisconnect(client: PdvSocket): void {
		const pdvSessionId = client.data.pdvSessionId
		if (pdvSessionId) {
			client.to(pdvRoom(pdvSessionId)).emit('scanner:disconnected', { socketId: client.id })
		}
	}

	@SubscribeMessage('pdv:join')
	async handleJoin(
		@ConnectedSocket() client: PdvSocket,
		@MessageBody() body: { pdvSessionId?: string },
	) {
		const pdvSessionId = body?.pdvSessionId
		if (!pdvSessionId) {
			throw new WsException('pdvSessionId is required.')
		}

		const pdvSession = await this.prisma.pdvSession.findUnique({ where: { id: pdvSessionId } })
		if (!pdvSession) {
			throw new WsException('PDV session not found.')
		}

		const canAccess = await this.permissionService.canAccessStore(
			client.data.userId,
			pdvSession.storeId,
		)
		if (!canAccess) {
			throw new WsException('You do not have access to this store.')
		}

		await client.join(pdvRoom(pdvSessionId))
		client.data.pdvSessionId = pdvSessionId

		client.emit('pdv:joined', { pdvSessionId })
		client.to(pdvRoom(pdvSessionId)).emit('scanner:connected', { socketId: client.id })

		client.emit('cart:updated', await this.presentDraftOrNull(pdvSessionId))
	}

	@SubscribeMessage('scanner:scan')
	async handleScan(
		@ConnectedSocket() client: PdvSocket,
		@MessageBody() body: { barcode?: string },
	) {
		const barcode = body?.barcode
		if (!barcode) {
			throw new WsException('barcode is required.')
		}

		const pdvSessionId = client.data.pdvSessionId
		if (!pdvSessionId) {
			throw new WsException('Join a PDV session before scanning.')
		}

		const result = await this.resolveVariantByBarcodeUseCase.execute({ pdvSessionId, barcode })

		if (!result.matched) {
			// Cart unchanged on purpose (US-10) — no cart:updated broadcast, just
			// an explicit not-found reply to the scanning socket via the ack.
			return { matched: false, barcode: result.barcode }
		}

		await this.addItemToSaleDraftUseCase.execute({
			pdvSessionId,
			variantId: result.variant.id,
		})
		this.cartEvents.emitCartUpdated(pdvSessionId)

		return { matched: true, variant: result.variant }
	}

	private async presentDraftOrNull(pdvSessionId: string) {
		const draft = await this.saleDraftsRepository.findOpenByPdvSessionId(pdvSessionId)
		return draft ? await presentSaleDraft(this.prisma, draft) : null
	}

	private async broadcastCartUpdated(pdvSessionId: string): Promise<void> {
		const payload = await this.presentDraftOrNull(pdvSessionId)
		this.server.to(pdvRoom(pdvSessionId)).emit('cart:updated', payload)
	}
}
