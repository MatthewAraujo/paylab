import { classifyChange } from '@/domain/benchmark/performance-change'

const higher = 'HIGHER_IS_BETTER' as const
const lower = 'LOWER_IS_BETTER' as const

describe('classifyChange', () => {
	it('reports the deltas and treats more throughput as an improvement', () => {
		expect(classifyChange({ current: 110, reference: 100, direction: higher })).toEqual({
			kind: 'compared',
			absoluteDelta: 10,
			percentDelta: 10,
			classification: 'improved',
		})
	})

	it('treats less throughput as a regression', () => {
		expect(classifyChange({ current: 90, reference: 100, direction: higher })).toEqual({
			kind: 'compared',
			absoluteDelta: -10,
			percentDelta: -10,
			classification: 'regressed',
		})
	})

	it('treats lower latency, errors, and contention as an improvement', () => {
		const result = classifyChange({ current: 90, reference: 100, direction: lower })

		expect(result).toMatchObject({ classification: 'improved', percentDelta: -10 })
	})

	it('treats higher latency, errors, and contention as a regression', () => {
		const result = classifyChange({ current: 110, reference: 100, direction: lower })

		expect(result).toMatchObject({ classification: 'regressed', percentDelta: 10 })
	})

	it('is stable at exactly +5% and -5%, and keeps the raw deltas', () => {
		expect(classifyChange({ current: 105, reference: 100, direction: higher })).toMatchObject({
			classification: 'stable',
			absoluteDelta: 5,
			percentDelta: 5,
		})
		expect(classifyChange({ current: 95, reference: 100, direction: lower })).toMatchObject({
			classification: 'stable',
			percentDelta: -5,
		})
	})

	it('is stable at the boundary even when the binary float sum is inexact', () => {
		expect(classifyChange({ current: 1.05, reference: 1, direction: higher })).toMatchObject({
			classification: 'stable',
		})
	})

	it('leaves the stable band just past 5%', () => {
		expect(classifyChange({ current: 105.1, reference: 100, direction: higher })).toMatchObject({
			classification: 'improved',
		})
		expect(classifyChange({ current: 94.9, reference: 100, direction: higher })).toMatchObject({
			classification: 'regressed',
		})
	})

	it('does not compute a percentage against a zero reference', () => {
		expect(classifyChange({ current: 3, reference: 0, direction: lower })).toEqual({
			kind: 'not-comparable',
			reason: 'zero-reference',
		})
	})

	it('does not turn an absent value into a number', () => {
		expect(classifyChange({ current: undefined, reference: 100, direction: higher })).toEqual({
			kind: 'not-comparable',
			reason: 'missing-value',
		})
		expect(classifyChange({ current: 100, reference: undefined, direction: higher })).toEqual({
			kind: 'not-comparable',
			reason: 'missing-value',
		})
	})
})
