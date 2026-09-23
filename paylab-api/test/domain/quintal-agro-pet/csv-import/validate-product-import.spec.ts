import { CsvImportValidationError } from '@/domain/quintalpet/application/use-cases/errors/csv-import-validation-error'
import {
	MAX_IMPORT_BYTES,
	MAX_IMPORT_ROWS,
} from '@/domain/quintalpet/enterprise/services/csv/product-import-limits'
import { validateProductImport } from '@/domain/quintalpet/enterprise/services/csv/validate-product-import'

// The `compare_at_price` column is a removed legacy field kept here on purpose:
// the importer must ignore the unknown column, not reject the file.
const HEADER =
	'product_slug,product_name,description,brand,primary_category,subcategory,variant_name,sku,price,compare_at_price,cost,barcode,weight,initial_stock'

function csv(lines: string[]): Buffer {
	return Buffer.from(`${lines.join('\n')}\n`, 'utf-8')
}

describe('validateProductImport', () => {
	test('a well-formed file has no row or file errors', () => {
		const result = validateProductImport(
			csv([
				HEADER,
				'racao-premium,Racao Premium,,Golden,Caes,Racoes,10kg,,199.90,,,,10kg,25',
				'racao-premium,Racao Premium,,,,,15kg,,289.90,,,,15kg,0',
			]),
		)

		expect(result.rowErrors).toEqual([])
		expect(result.fileErrors).toEqual([])
		expect(result.groups).toHaveLength(1)
	})

	test('more than MAX_IMPORT_ROWS data rows is a TOO_MANY_ROWS file error', () => {
		const rows = Array.from(
			{ length: MAX_IMPORT_ROWS + 1 },
			(_, i) => `p-${i},P ${i},,,,,v,,10.00,,,,,0`,
		)

		const result = validateProductImport(csv([HEADER, ...rows]))

		expect(result.fileErrors).toEqual([expect.objectContaining({ code: 'TOO_MANY_ROWS' })])
	})

	test('an empty file (header only) is an EMPTY_FILE file error', () => {
		const result = validateProductImport(csv([HEADER]))

		expect(result.fileErrors).toEqual([expect.objectContaining({ code: 'EMPTY_FILE' })])
	})

	test('a buffer larger than MAX_IMPORT_BYTES is a FILE_TOO_LARGE file error', () => {
		const oversized = Buffer.alloc(MAX_IMPORT_BYTES + 1, 0x61)

		const result = validateProductImport(oversized)

		expect(result.fileErrors).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'FILE_TOO_LARGE' })]),
		)
	})

	test('missing required fields each produce a row error carrying the column', () => {
		const result = validateProductImport(
			csv([
				HEADER,
				',No Slug,,,,,x,,10.00,,,,,0',
				'has-slug,,,,,,y,,10.00,,,,,0',
				'has-name,Has Name,,,,,,,10.00,,,,,0',
				'no-price,No Price,,,,,z,,,,,,,0',
			]),
		)

		expect(result.rowErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ column: 'product_slug', code: 'MISSING_REQUIRED_FIELD' }),
				expect.objectContaining({ column: 'product_name', code: 'MISSING_REQUIRED_FIELD' }),
				expect.objectContaining({ column: 'variant_name', code: 'MISSING_REQUIRED_FIELD' }),
				expect.objectContaining({ column: 'price', code: 'MISSING_REQUIRED_FIELD' }),
			]),
		)
	})

	test('a non-numeric price is an INVALID_PRICE row error', () => {
		const result = validateProductImport(csv([HEADER, 'a,A,,,,,x,,abc,,,,,0']))

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ line: 2, column: 'price', code: 'INVALID_PRICE' }),
		])
	})

	test('a negative initial_stock is an INVALID_STOCK row error', () => {
		const result = validateProductImport(csv([HEADER, 'a,A,,,,,x,,10.00,,,,,-5']))

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ line: 2, column: 'initial_stock', code: 'INVALID_STOCK' }),
		])
	})

	test('an editorial-field conflict within a product_slug group is a GROUP_FIELD_CONFLICT row error', () => {
		const result = validateProductImport(
			csv([
				HEADER,
				'racao,Racao Premium,,,,,10kg,,10.00,,,,,0',
				'racao,Outro Nome,,,,,15kg,,12.00,,,,,0',
			]),
		)

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ line: 3, code: 'GROUP_FIELD_CONFLICT' }),
		])
	})

	test('two brand names that normalize to the same slug are an AMBIGUOUS_SLUG row error', () => {
		const result = validateProductImport(
			csv([HEADER, 'a,A,,Golden,,,x,,10.00,,,,,0', 'b,B,,Golden!,,,y,,10.00,,,,,0']),
		)

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ column: 'brand', code: 'AMBIGUOUS_SLUG' }),
		])
	})

	test('simple subcategory names remain valid without the old hierarchy syntax', () => {
		const result = validateProductImport(
			csv([HEADER, 'a,A,,,Cães,Ração,x,,10.00,,,,,0', 'b,B,,,Caes,Ração,y,,10.00,,,,,0']),
		)

		expect(result.rowErrors).toEqual([])
	})

	test('CsvImportValidationError carries the row and file error lists', () => {
		const error = new CsvImportValidationError(
			[{ line: 3, column: 'price', code: 'INVALID_PRICE', message: 'x' }],
			[{ code: 'TOO_MANY_ROWS', message: 'y' }],
		)

		expect(error).toBeInstanceOf(Error)
		expect(error.rowErrors).toHaveLength(1)
		expect(error.fileErrors).toHaveLength(1)
	})
})
