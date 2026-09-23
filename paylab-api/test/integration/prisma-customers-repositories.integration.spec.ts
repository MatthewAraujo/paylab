import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreCustomerConflictError } from '@/domain/quintalpet/application/use-cases/errors/store-customer-conflict-error'
import { CRMProfile } from '@/domain/quintalpet/enterprise/entities/crm-profile'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { CRMInteractionChannel } from '@/domain/quintalpet/enterprise/types/crm-interaction-channel'
import { CRMInteractionType } from '@/domain/quintalpet/enterprise/types/crm-interaction-type'
import { CustomerSegment } from '@/domain/quintalpet/enterprise/types/customer-segment'
import { StoreCustomerStatus } from '@/domain/quintalpet/enterprise/types/store-customer-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCRMRepository } from '@/infra/database/prisma/repositories/crm/prisma-crm-repository'
import { PrismaStoreCustomersRepository } from '@/infra/database/prisma/repositories/customers/prisma-store-customers-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const storeCustomersRepository = new PrismaStoreCustomersRepository(prisma)
const crmRepository = new PrismaCRMRepository(prisma)

async function resetDatabase() {
	await prisma.cRMInteraction.deleteMany()
	await prisma.cRMProfile.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.attachment.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

describe('Prisma customers and CRM schema invariants', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('StoreCustomer is unique per (storeId, customerProfileId)', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Norte', slug: 'quintal-norte-customers' },
		})

		await prisma.storeCustomer.create({
			data: {
				storeId: store.id,
				customerProfileId: 'customer-profile-1',
				email: 'ana@example.com',
			},
		})

		await expect(
			prisma.storeCustomer.create({
				data: {
					storeId: store.id,
					customerProfileId: 'customer-profile-1',
					email: 'ana-dup@example.com',
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })
	})

	test('CRMProfile is unique per storeCustomerId', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sul', slug: 'quintal-sul-customers' },
		})
		const storeCustomer = await prisma.storeCustomer.create({
			data: {
				storeId: store.id,
				customerProfileId: 'customer-profile-2',
				email: 'bruno@example.com',
			},
		})

		await prisma.cRMProfile.create({
			data: { storeCustomerId: storeCustomer.id },
		})

		await expect(
			prisma.cRMProfile.create({
				data: { storeCustomerId: storeCustomer.id },
			}),
		).rejects.toMatchObject({ code: 'P2002' })
	})

	test('deleting a Store cascades through StoreCustomer, StoreCustomerAddress, CRMProfile, and CRMInteraction', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Leste', slug: 'quintal-leste-customers' },
		})
		const storeCustomer = await prisma.storeCustomer.create({
			data: {
				storeId: store.id,
				customerProfileId: 'customer-profile-3',
				email: 'carla@example.com',
			},
		})
		await prisma.storeCustomerAddress.create({
			data: {
				storeCustomerId: storeCustomer.id,
				street: 'Rua das Flores',
				number: '100',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '01000-000',
				isDefault: true,
			},
		})
		const crmProfile = await prisma.cRMProfile.create({
			data: { storeCustomerId: storeCustomer.id },
		})
		await prisma.cRMInteraction.create({
			data: {
				crmProfileId: crmProfile.id,
				type: 'NOTE',
				channel: 'SYSTEM',
				content: 'First contact',
			},
		})

		await prisma.store.delete({ where: { id: store.id } })

		const [customers, addresses, profiles, interactions] = await Promise.all([
			prisma.storeCustomer.findMany({ where: { storeId: store.id } }),
			prisma.storeCustomerAddress.findMany({ where: { storeCustomerId: storeCustomer.id } }),
			prisma.cRMProfile.findMany({ where: { storeCustomerId: storeCustomer.id } }),
			prisma.cRMInteraction.findMany({ where: { crmProfileId: crmProfile.id } }),
		])

		expect(customers).toHaveLength(0)
		expect(addresses).toHaveLength(0)
		expect(profiles).toHaveLength(0)
		expect(interactions).toHaveLength(0)
	})
})

describe('Prisma customers and CRM repositories', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('save() persists a new StoreCustomer together with its addresses', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Norte', slug: 'quintal-norte-repo' },
		})

		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID(store.id),
			customerProfileId: 'customer-profile-repo-1',
			email: 'diana@example.com',
			name: 'Diana',
		})
		storeCustomer.addAddress(
			StoreCustomerAddress.create({
				storeCustomerId: storeCustomer.id,
				street: 'Rua A',
				number: '10',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '01000-000',
				isDefault: true,
			}),
		)

		await storeCustomersRepository.save(storeCustomer)

		const persisted = await storeCustomersRepository.findByStoreAndCustomerProfile(
			store.id,
			'customer-profile-repo-1',
		)

		expect(persisted).not.toBeNull()
		expect(persisted?.email).toBe('diana@example.com')
		expect(persisted?.addresses).toHaveLength(1)
		expect(persisted?.addresses[0].isDefault).toBe(true)
	})

	test('findByStoreAndCustomerProfile hydrates addresses and returns null for other stores', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'Store A', slug: 'store-a-repo' } }),
			prisma.store.create({ data: { name: 'Store B', slug: 'store-b-repo' } }),
		])

		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID(storeA.id),
			customerProfileId: 'customer-profile-repo-2',
			email: 'erika@example.com',
		})
		await storeCustomersRepository.save(storeCustomer)

		const foundInStoreB = await storeCustomersRepository.findByStoreAndCustomerProfile(
			storeB.id,
			'customer-profile-repo-2',
		)
		expect(foundInStoreB).toBeNull()

		const foundInStoreA = await storeCustomersRepository.findByStoreAndCustomerProfile(
			storeA.id,
			'customer-profile-repo-2',
		)
		expect(foundInStoreA).not.toBeNull()
	})

	test('a repeated save() for the same (storeId, customerProfileId) surfaces as StoreCustomerConflictError', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Conflict', slug: 'quintal-conflict-repo' },
		})

		const first = StoreCustomer.create({
			storeId: new UniqueEntityID(store.id),
			customerProfileId: 'customer-profile-repo-3',
			email: 'fabio@example.com',
		})
		await storeCustomersRepository.save(first)

		const racingDuplicate = StoreCustomer.create({
			storeId: new UniqueEntityID(store.id),
			customerProfileId: 'customer-profile-repo-3',
			email: 'fabio-dup@example.com',
		})

		await expect(storeCustomersRepository.save(racingDuplicate)).rejects.toThrow(
			StoreCustomerConflictError,
		)
	})

	test('listByStore filters by status and never leaks another store', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'Store List A', slug: 'store-list-a-repo' } }),
			prisma.store.create({ data: { name: 'Store List B', slug: 'store-list-b-repo' } }),
		])

		const active = StoreCustomer.create({
			storeId: new UniqueEntityID(storeA.id),
			customerProfileId: 'customer-profile-repo-active',
			email: 'active@example.com',
		})
		const suspended = StoreCustomer.create({
			storeId: new UniqueEntityID(storeA.id),
			customerProfileId: 'customer-profile-repo-suspended',
			email: 'suspended@example.com',
		})
		suspended.suspend()
		const otherStoreCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID(storeB.id),
			customerProfileId: 'customer-profile-repo-other-store',
			email: 'other-store@example.com',
		})

		await Promise.all([
			storeCustomersRepository.save(active),
			storeCustomersRepository.save(suspended),
			storeCustomersRepository.save(otherStoreCustomer),
		])

		const allInStoreA = await storeCustomersRepository.listByStore(storeA.id, {
			page: 1,
			perPage: 10,
		})
		expect(allInStoreA.total).toBe(2)
		expect(allInStoreA.items.every((item) => item.storeId.toString() === storeA.id)).toBe(true)

		const onlySuspended = await storeCustomersRepository.listByStore(storeA.id, {
			status: StoreCustomerStatus.SUSPENDED,
			page: 1,
			perPage: 10,
		})
		expect(onlySuspended.total).toBe(1)
		expect(onlySuspended.items[0].email).toBe('suspended@example.com')
	})

	test('CRMRepository.save persists a CRMProfile and appends interactions without duplicating them on repeated saves', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal CRM', slug: 'quintal-crm-repo' },
		})
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID(store.id),
			customerProfileId: 'customer-profile-repo-crm',
			email: 'gustavo@example.com',
		})
		await storeCustomersRepository.save(storeCustomer)

		const crmProfile = CRMProfile.create({ storeCustomerId: storeCustomer.id })
		crmProfile.recordInteraction({
			type: CRMInteractionType.NOTE,
			channel: CRMInteractionChannel.SYSTEM,
			content: 'Hi',
		})
		await crmRepository.save(crmProfile)
		await crmRepository.save(crmProfile)

		const persisted = await crmRepository.findByStoreCustomerId(storeCustomer.id.toString())
		expect(persisted?.interactions).toHaveLength(1)
	})

	test('CRMRepository lists StoreCustomers by segment and by tag, scoped to the given store', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'Store Segment A', slug: 'store-segment-a-repo' } }),
			prisma.store.create({ data: { name: 'Store Segment B', slug: 'store-segment-b-repo' } }),
		])

		const vipInStoreA = StoreCustomer.create({
			storeId: new UniqueEntityID(storeA.id),
			customerProfileId: 'customer-profile-repo-vip-a',
			email: 'vip-a@example.com',
		})
		const vipInStoreB = StoreCustomer.create({
			storeId: new UniqueEntityID(storeB.id),
			customerProfileId: 'customer-profile-repo-vip-b',
			email: 'vip-b@example.com',
		})
		await Promise.all([
			storeCustomersRepository.save(vipInStoreA),
			storeCustomersRepository.save(vipInStoreB),
		])

		const vipProfileA = CRMProfile.create({ storeCustomerId: vipInStoreA.id })
		vipProfileA.updateSegment(CustomerSegment.VIP)
		vipProfileA.addTag('outreach')
		const vipProfileB = CRMProfile.create({ storeCustomerId: vipInStoreB.id })
		vipProfileB.updateSegment(CustomerSegment.VIP)
		vipProfileB.addTag('outreach')

		await Promise.all([crmRepository.save(vipProfileA), crmRepository.save(vipProfileB)])

		const bySegment = await crmRepository.listStoreCustomersBySegment(
			storeA.id,
			CustomerSegment.VIP,
			{
				page: 1,
				perPage: 10,
			},
		)
		expect(bySegment.total).toBe(1)
		expect(bySegment.items[0].email).toBe('vip-a@example.com')

		const byTag = await crmRepository.listStoreCustomersByTag(storeA.id, 'outreach', {
			page: 1,
			perPage: 10,
		})
		expect(byTag.total).toBe(1)
		expect(byTag.items[0].email).toBe('vip-a@example.com')
	})

	test('deleting the parent Store cascades through the repository-managed rows too', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Cascade Repo', slug: 'quintal-cascade-repo' },
		})
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID(store.id),
			customerProfileId: 'customer-profile-repo-cascade',
			email: 'helena@example.com',
		})
		await storeCustomersRepository.save(storeCustomer)
		const crmProfile = CRMProfile.create({ storeCustomerId: storeCustomer.id })
		await crmRepository.save(crmProfile)

		await prisma.store.delete({ where: { id: store.id } })

		const foundCustomer = await storeCustomersRepository.findById(
			storeCustomer.id.toString(),
			store.id,
		)
		const foundProfile = await crmRepository.findByStoreCustomerId(storeCustomer.id.toString())
		expect(foundCustomer).toBeNull()
		expect(foundProfile).toBeNull()
	})
})
