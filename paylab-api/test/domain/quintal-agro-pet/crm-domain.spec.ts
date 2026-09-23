import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CRMProfile } from '@/domain/quintalpet/enterprise/entities/crm-profile'
import { CRMInteractionChannel } from '@/domain/quintalpet/enterprise/types/crm-interaction-channel'
import { CRMInteractionType } from '@/domain/quintalpet/enterprise/types/crm-interaction-type'
import { CustomerSegment } from '@/domain/quintalpet/enterprise/types/customer-segment'

describe('quintal agro pet CRM domain', () => {
	test('CRMProfile.create defaults segment to NEW and tags to an empty list', () => {
		const profile = CRMProfile.create({
			storeCustomerId: new UniqueEntityID('store-customer-1'),
		})

		expect(profile.segment).toBe(CustomerSegment.NEW)
		expect(profile.tags).toEqual([])
	})

	test('updateSegment changes the segment', () => {
		const profile = CRMProfile.create({
			storeCustomerId: new UniqueEntityID('store-customer-1'),
		})

		profile.updateSegment(CustomerSegment.VIP)
		expect(profile.segment).toBe(CustomerSegment.VIP)
	})

	test('addTag twice with the same tag results in the tag appearing exactly once', () => {
		const profile = CRMProfile.create({
			storeCustomerId: new UniqueEntityID('store-customer-1'),
		})

		profile.addTag('vip')
		profile.addTag('vip')

		expect(profile.tags).toEqual(['vip'])
	})

	test('removeTag on a profile without that tag is a no-op', () => {
		const profile = CRMProfile.create({
			storeCustomerId: new UniqueEntityID('store-customer-1'),
			tags: ['vip'],
		})

		expect(() => profile.removeTag('missing')).not.toThrow()
		expect(profile.tags).toEqual(['vip'])
	})

	test('recordInteraction appends distinct interactions even with identical fields', () => {
		const profile = CRMProfile.create({
			storeCustomerId: new UniqueEntityID('store-customer-1'),
		})

		const first = profile.recordInteraction({
			type: CRMInteractionType.NOTE,
			channel: CRMInteractionChannel.SYSTEM,
			content: 'Follow up next week',
		})
		const second = profile.recordInteraction({
			type: CRMInteractionType.NOTE,
			channel: CRMInteractionChannel.SYSTEM,
			content: 'Follow up next week',
		})

		expect(profile.interactions).toHaveLength(2)
		expect(first.id.equals(second.id)).toBe(false)
		expect(profile.lastContactAt).toEqual(second.createdAt)
	})
})
