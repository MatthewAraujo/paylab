import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { HomeMerchandisingConfiguration } from '@/domain/quintalpet/enterprise/entities/home-merchandising-configuration'
import { DuplicateMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/duplicate-merchandising-reference-error'
import { InvalidMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/invalid-merchandising-reference-error'
import { MerchandisingLimitExceededError } from '@/domain/quintalpet/enterprise/errors/merchandising-limit-exceeded-error'

describe('quintal agro pet home merchandising configuration', () => {
	test('accepts a flat, ordered list of featured categories and products', () => {
		const storeId = new UniqueEntityID('store-1')
		const configuration = HomeMerchandisingConfiguration.create({ storeId })

		configuration.replaceFeaturedCategories([
			{ entityId: new UniqueEntityID('dog-1'), storeId },
			{ entityId: new UniqueEntityID('dog-2'), storeId },
			{ entityId: new UniqueEntityID('cat-1'), storeId },
			{ entityId: new UniqueEntityID('agro-1'), storeId },
		])
		configuration.replaceFeaturedProducts([{ entityId: new UniqueEntityID('product-1'), storeId }])

		expect(configuration.featuredCategoryIds.map((id) => id.toString())).toEqual([
			'dog-1',
			'dog-2',
			'cat-1',
			'agro-1',
		])
		expect(configuration.featuredProductIds.map((id) => id.toString())).toEqual(['product-1'])
	})

	test('rejects duplicate categories in the same replacement', () => {
		const storeId = new UniqueEntityID('store-1')
		const configuration = HomeMerchandisingConfiguration.create({ storeId })

		expect(() =>
			configuration.replaceFeaturedCategories([
				{ entityId: new UniqueEntityID('shared-1'), storeId },
				{ entityId: new UniqueEntityID('shared-1'), storeId },
			]),
		).toThrow(DuplicateMerchandisingReferenceError)
	})

	test('rejects cross-store references and explicit limit overflow', () => {
		const storeId = new UniqueEntityID('store-1')
		const configuration = HomeMerchandisingConfiguration.create({ storeId })

		expect(() =>
			configuration.replaceFeaturedCategories([
				{
					entityId: new UniqueEntityID('agro-1'),
					storeId: new UniqueEntityID('store-2'),
				},
			]),
		).toThrow(InvalidMerchandisingReferenceError)

		expect(() =>
			configuration.replaceFeaturedCategories(
				[
					{ entityId: new UniqueEntityID('dog-1'), storeId },
					{ entityId: new UniqueEntityID('dog-2'), storeId },
					{ entityId: new UniqueEntityID('dog-3'), storeId },
					{ entityId: new UniqueEntityID('dog-4'), storeId },
				],
				3,
			),
		).toThrow(MerchandisingLimitExceededError)

		expect(() =>
			configuration.replaceFeaturedProducts(
				Array.from({ length: 9 }, (_, index) => ({
					entityId: new UniqueEntityID(`product-${index + 1}`),
					storeId,
				})),
				8,
			),
		).toThrow(MerchandisingLimitExceededError)
	})
})
