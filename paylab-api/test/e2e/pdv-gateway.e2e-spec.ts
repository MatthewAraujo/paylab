import { AddressInfo } from 'node:net'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Socket, io } from 'socket.io-client'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

async function seedVariant(
	prisma: PrismaService,
	storeId: string,
	suffix: string,
	options: { priceCents?: number; barcode?: string | null } = {},
) {
	const brand = await prisma.brand.create({
		data: { storeId, name: 'Marca', slug: `marca-${suffix}` },
	})
	const category = await prisma.category.create({
		data: { storeId, name: 'Categoria', slug: `categoria-${suffix}` },
	})
	const product = await prisma.product.create({
		data: {
			storeId,
			name: 'Racao Premium',
			slug: `produto-${suffix}`,
			brandId: brand.id,
			primaryCategoryId: category.id,
		},
	})
	return prisma.productVariant.create({
		data: {
			storeId,
			productId: product.id,
			name: '15kg',
			sku: `SKU-${suffix}`,
			priceCents: options.priceCents ?? 5000,
			status: 'ACTIVE',
			barcode: options.barcode ?? null,
		},
	})
}

const TIMEOUT_MS = 5000

function waitForEvent<T = unknown>(socket: Socket, event: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Timed out waiting for "${event}"`))
		}, TIMEOUT_MS)
		socket.once(event, (payload: T) => {
			clearTimeout(timer)
			resolve(payload)
		})
	})
}

describe('PDV Socket.IO gateway (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
	let baseUrl: string
	const openSockets: Socket[] = []

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)

		await app.init()
		await app.listen(0)
		const address = app.getHttpServer().address() as AddressInfo
		baseUrl = `http://127.0.0.1:${address.port}`
	})

	beforeEach(async () => {
		await resetDatabase(prisma)
	})

	afterEach(() => {
		for (const socket of openSockets.splice(0)) {
			socket.removeAllListeners()
			socket.disconnect()
		}
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	function connect(cookie?: string): Socket {
		const socket = io(baseUrl, {
			transports: ['websocket'],
			forceNew: true,
			reconnection: false,
			extraHeaders: cookie ? { Cookie: cookie } : undefined,
		})
		openSockets.push(socket)
		return socket
	}

	function connectAndWait(cookie?: string): Promise<Socket> {
		const socket = connect(cookie)
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Timed out connecting')), TIMEOUT_MS)
			socket.once('connect', () => {
				clearTimeout(timer)
				resolve(socket)
			})
			socket.once('connect_error', (error) => {
				clearTimeout(timer)
				reject(error)
			})
		})
	}

	test('an unauthenticated socket is rejected at handshake', async () => {
		await expect(connectAndWait()).rejects.toBeTruthy()
	})

	test('a StoreMember of the session store can join, receiving pdv:joined and an immediate cart:updated', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const pdvSession = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1' },
		})
		const draft = await prisma.saleDraft.create({
			data: { pdvSessionId: pdvSession.id },
		})

		const socket = await connectAndWait(cookie)
		const joinedPromise = waitForEvent(socket, 'pdv:joined')
		const cartPromise = waitForEvent<{ id: string } | null>(socket, 'cart:updated')

		socket.emit('pdv:join', { pdvSessionId: pdvSession.id })

		const joined = await joinedPromise
		expect(joined).toEqual({ pdvSessionId: pdvSession.id })

		const cart = await cartPromise
		expect(cart).not.toBeNull()
		expect(cart?.id).toBe(draft.id)
	})

	test('a StoreMember of a different store is rejected on pdv:join', async () => {
		const { store } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const pdvSession = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1' },
		})
		await prisma.saleDraft.create({ data: { pdvSessionId: pdvSession.id } })

		const socket = await connectAndWait(other.cookie)
		const exceptionPromise = waitForEvent(socket, 'exception')

		socket.emit('pdv:join', { pdvSessionId: pdvSession.id })

		await expect(exceptionPromise).resolves.toBeTruthy()
	})

	test('scanner:scan with a matching barcode increments the cart and broadcasts cart:updated to every socket in the room', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'scan-match')
		const pdvSession = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1' },
		})
		await prisma.saleDraft.create({ data: { pdvSessionId: pdvSession.id } })
		await prisma.productVariant.update({
			where: { id: variant.id },
			data: { barcode: 'scan-code-1' },
		})

		const scannerSocket = await connectAndWait(cookie)
		const registerSocket = await connectAndWait(cookie)

		scannerSocket.emit('pdv:join', { pdvSessionId: pdvSession.id })
		await waitForEvent(scannerSocket, 'cart:updated')
		registerSocket.emit('pdv:join', { pdvSessionId: pdvSession.id })
		await waitForEvent(registerSocket, 'cart:updated')

		const registerCartUpdatedPromise = waitForEvent<{ items: unknown[] }>(
			registerSocket,
			'cart:updated',
		)

		const ack = await new Promise<{ matched: boolean; variant?: { id: string } }>((resolve) => {
			scannerSocket.emit('scanner:scan', { barcode: 'scan-code-1' }, resolve)
		})
		expect(ack.matched).toBe(true)
		expect(ack.variant?.id).toBe(variant.id)

		const registerCart = await registerCartUpdatedPromise
		expect(registerCart.items).toHaveLength(1)
	})

	test('scanner:scan with an unmatched barcode does not broadcast cart:updated, and the sender gets an explicit not-found ack', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const pdvSession = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1' },
		})
		await prisma.saleDraft.create({ data: { pdvSessionId: pdvSession.id } })

		const socket = await connectAndWait(cookie)
		socket.emit('pdv:join', { pdvSessionId: pdvSession.id })
		await waitForEvent(socket, 'cart:updated')

		let receivedCartUpdate = false
		socket.on('cart:updated', () => {
			receivedCartUpdate = true
		})

		const ack = await new Promise<{ matched: boolean; barcode?: string }>((resolve) => {
			socket.emit('scanner:scan', { barcode: 'never-seen-barcode' }, resolve)
		})

		expect(ack.matched).toBe(false)
		expect(ack.barcode).toBe('never-seen-barcode')

		await new Promise((resolve) => setTimeout(resolve, 200))
		expect(receivedCartUpdate).toBe(false)

		const persistedDraft = await prisma.saleDraft.findFirst({
			where: { pdvSessionId: pdvSession.id },
		})
		expect(persistedDraft?.unmatchedBarcodes).toEqual(['never-seen-barcode'])
	})

	test('an action through the REST controller also broadcasts cart:updated to connected sockets', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'rest-broadcast')
		const pdvSession = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1' },
		})
		await prisma.saleDraft.create({ data: { pdvSessionId: pdvSession.id } })

		const socket = await connectAndWait(cookie)
		socket.emit('pdv:join', { pdvSessionId: pdvSession.id })
		await waitForEvent(socket, 'cart:updated')

		const cartUpdatedPromise = waitForEvent<{ items: unknown[] }>(socket, 'cart:updated')

		const request = (await import('supertest')).default
		const response = await request(app.getHttpServer())
			.post(`/api/v1/admin/pdv/sessions/${pdvSession.id}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 1 })
		expect(response.statusCode).toBe(201)

		const cartUpdate = await cartUpdatedPromise
		expect(cartUpdate.items).toHaveLength(1)
	})

	test('disconnecting and reconnecting with the same session credentials re-receives the current cart:updated state', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'reconnect')
		const pdvSession = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1' },
		})
		const draft = await prisma.saleDraft.create({ data: { pdvSessionId: pdvSession.id } })
		await prisma.saleDraftItem.create({
			data: { saleDraftId: draft.id, variantId: variant.id, quantity: 2 },
		})

		const firstSocket = await connectAndWait(cookie)
		firstSocket.emit('pdv:join', { pdvSessionId: pdvSession.id })
		const firstCart = await waitForEvent<{ items: unknown[] }>(firstSocket, 'cart:updated')
		expect(firstCart.items).toHaveLength(1)

		firstSocket.disconnect()
		await new Promise((resolve) => setTimeout(resolve, 100))

		const secondSocket = await connectAndWait(cookie)
		secondSocket.emit('pdv:join', { pdvSessionId: pdvSession.id })
		const secondCart = await waitForEvent<{ items: unknown[] }>(secondSocket, 'cart:updated')
		expect(secondCart.items).toHaveLength(1)
	})
})
