import {
	normalizeName,
	parseCategoryReference,
} from '@/domain/quintalpet/enterprise/services/csv/category-reference'

describe('category reference helpers', () => {
	test('parseCategoryReference splits a path and trims each segment', () => {
		expect(parseCategoryReference('  Gatos   >   Ração  ')).toEqual(['Gatos', 'Ração'])
	})

	test('parseCategoryReference drops empty segments and blank input', () => {
		expect(parseCategoryReference('Gatos > Ração > ')).toEqual(['Gatos', 'Ração'])
		expect(parseCategoryReference(' > ')).toEqual([])
		expect(parseCategoryReference('   ')).toEqual([])
	})

	test('normalizeName ignores accents, case, and repeated whitespace', () => {
		expect(normalizeName('Ração')).toBe('racao')
		expect(normalizeName(' racao ')).toBe('racao')
		expect(normalizeName('  RAÇÃO   PREMIUM  ')).toBe('racao premium')
	})
})
