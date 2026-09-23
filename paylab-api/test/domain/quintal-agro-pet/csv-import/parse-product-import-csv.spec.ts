import { parseProductImportCsv } from '@/domain/quintalpet/enterprise/services/csv/parse-product-import-csv'

// Canonical import columns (see product-import-columns.ts). A legacy
// `compare_at_price` column is intentionally kept in these header lines: it was
// removed from the schema (markdown is a Promotion now, not a variant field) and
// the parser must ignore the unknown column gracefully rather than error.
const HEADER =
	'product_slug,product_name,description,brand,primary_category,subcategory,variant_name,sku,price,compare_at_price,cost,barcode,weight,initial_stock'

function csv(lines: string[]): Buffer {
	return Buffer.from(`${lines.join('\n')}\n`, 'utf-8')
}

describe('parseProductImportCsv', () => {
	test('parses a comma-delimited file into one group per product_slug', () => {
		const result = parseProductImportCsv(
			csv([
				HEADER,
				'racao-premium,Racao Premium,Super premium,Golden,Caes,Racoes,10kg,,199.90,229.90,,7891234567890,10kg,25',
				'racao-premium,Racao Premium,,,,,15kg,,289.90,,,,15kg,10',
			]),
		)

		expect(result.fileErrors).toEqual([])
		expect(result.rowErrors).toEqual([])
		expect(result.groups).toHaveLength(1)

		const [group] = result.groups
		expect(group.productSlug).toBe('racao-premium')
		expect(group.productName).toBe('Racao Premium')
		expect(group.description).toBe('Super premium')
		expect(group.brand).toBe('Golden')
		expect(group.primaryCategory).toBe('Caes')
		expect(group.categories).toEqual(['Racoes'])
		expect(group.variants).toHaveLength(2)

		expect(group.variants[0]).toMatchObject({
			line: 2,
			variantName: '10kg',
			priceCents: 19990,
			barcode: '7891234567890',
			attributes: { weight: '10kg' },
			initialStock: 25,
		})
		expect(group.variants[0].sku).toBeUndefined()
		expect(group.variants[1]).toMatchObject({
			line: 3,
			variantName: '15kg',
			priceCents: 28990,
			initialStock: 10,
		})
	})

	test('ignores an unknown legacy compare_at_price column without erroring', () => {
		const result = parseProductImportCsv(
			csv([HEADER, 'racao,Racao,,,Caes,,10kg,,199.90,229.90,,7891234567890,10kg,5']),
		)

		expect(result.fileErrors).toEqual([])
		expect(result.rowErrors).toEqual([])
		expect(result.groups[0].variants[0]).toMatchObject({
			variantName: '10kg',
			priceCents: 19990,
			barcode: '7891234567890',
			attributes: { weight: '10kg' },
			initialStock: 5,
		})
		expect(result.groups[0].variants[0]).not.toHaveProperty('compareAtPriceCents')
	})

	test('a semicolon-delimited file parses to the same structs', () => {
		const semicolon = parseProductImportCsv(
			Buffer.from(
				`${HEADER.replace(/,/g, ';')}\nracao-premium;Racao Premium;Super premium;Golden;Caes;Racoes;10kg;;199,90;;;;;25\n`,
				'utf-8',
			),
		)

		expect(semicolon.fileErrors).toEqual([])
		expect(semicolon.rowErrors).toEqual([])
		expect(semicolon.groups[0].variants[0]).toMatchObject({
			variantName: '10kg',
			priceCents: 19990,
			initialStock: 25,
		})
	})

	test('decodes a latin1-encoded file with Portuguese accents', () => {
		const latin1 = Buffer.concat([
			Buffer.from(`${HEADER}\n`, 'latin1'),
			Buffer.from('racao,Ração,Ração para cão,,Cães,,Padrão,,10.00,,,,,0\n', 'latin1'),
		])

		const result = parseProductImportCsv(latin1)

		expect(result.fileErrors).toEqual([])
		expect(result.groups[0].productName).toBe('Ração')
		expect(result.groups[0].primaryCategory).toBe('Cães')
		expect(result.groups[0].variants[0].variantName).toBe('Padrão')
	})

	test('decodes a UTF-8 file with Portuguese accents', () => {
		const result = parseProductImportCsv(csv([HEADER, 'racao,Ração,,,Cães,,Padrão,,10.00,,,,,0']))

		expect(result.groups[0].productName).toBe('Ração')
		expect(result.groups[0].primaryCategory).toBe('Cães')
	})

	test('reports a file error when a required column is missing from the header', () => {
		const result = parseProductImportCsv(csv(['product_slug,product_name,variant_name', 'a,A,X']))

		expect(result.groups).toEqual([])
		expect(result.fileErrors).toEqual([expect.objectContaining({ code: 'MISSING_COLUMNS' })])
	})

	test('reports an empty file (header only, zero data rows)', () => {
		const result = parseProductImportCsv(csv([HEADER]))

		expect(result.fileErrors).toEqual([expect.objectContaining({ code: 'EMPTY_FILE' })])
	})

	test('ignores a Portuguese translated-columns line before the technical header', () => {
		const result = parseProductImportCsv(
			csv([
				'# slug do produto,nome do produto,descrição,marca,categoria principal,subcategoria,nome da variante,sku,preço,preço promocional,custo,código de barras,peso,estoque inicial',
				HEADER,
				'racao,Ração Premium,,,Cães,Rações,10kg,,10.00,,,,,0',
			]),
		)

		expect(result.fileErrors).toEqual([])
		expect(result.rowErrors).toEqual([])
		expect(result.groups[0].productName).toBe('Ração Premium')
		expect(result.groups[0].variants[0].line).toBe(3)
	})

	test('accepts both "49.90" and "49,90" and pt-BR grouped "1.234,56"', () => {
		const result = parseProductImportCsv(
			csv([
				HEADER,
				'p1,P1,,,,,a,,49.90,,,,,0',
				'p2,P2,,,,,b,,"49,90",,,,,0',
				'p3,P3,,,,,c,,"1.234,56",,,,,0',
			]),
		)

		expect(result.rowErrors).toEqual([])
		expect(result.groups.map((g) => g.variants[0].priceCents)).toEqual([4990, 4990, 123456])
	})

	test("the weight column becomes the variant's only attribute; blank means no attributes", () => {
		const result = parseProductImportCsv(
			csv([
				HEADER,
				'com-peso,Com Peso,,,,,a,,10.00,,,,500g,0',
				'sem-peso,Sem Peso,,,,,b,,10.00,,,,,0',
				'peso-livre,Peso Livre,,,,,c,,10.00,,,,"2 Litros",0',
			]),
		)

		expect(result.rowErrors).toEqual([])
		expect(result.groups.find((g) => g.productSlug === 'com-peso')?.variants[0].attributes).toEqual(
			{
				weight: '500g',
			},
		)
		expect(result.groups.find((g) => g.productSlug === 'sem-peso')?.variants[0].attributes).toEqual(
			{},
		)
		expect(
			result.groups.find((g) => g.productSlug === 'peso-livre')?.variants[0].attributes,
		).toEqual({ weight: '2 Litros' })
	})

	test('stores a single subcategory name and treats an empty cell as no subcategory', () => {
		const result = parseProductImportCsv(
			csv([HEADER, 'a,A,,,Caes,Racoes,x,,10.00,,,,,0', 'b,B,,,,,y,,10.00,,,,,0']),
		)

		expect(result.groups[0].categories).toEqual(['Racoes'])
		expect(result.groups[1].categories).toEqual([])
	})

	test('rejects the old pipe and path formats in subcategory', () => {
		const result = parseProductImportCsv(
			csv([
				HEADER,
				'a,A,,,Caes,Caes|Racoes,x,,10.00,,,,,0',
				'b,B,,,Caes,Caes > Racoes,y,,10.00,,,,,0',
			]),
		)

		expect(result.rowErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					line: 2,
					column: 'subcategory',
					code: 'INVALID_SUBCATEGORY_FORMAT',
				}),
				expect.objectContaining({
					line: 3,
					column: 'subcategory',
					code: 'INVALID_SUBCATEGORY_FORMAT',
				}),
			]),
		)
	})

	test('initial_stock: blank is 0, non-integer and negative are row errors', () => {
		const result = parseProductImportCsv(
			csv([HEADER, 'a,A,,,,,x,,10.00,,,,,', 'b,B,,,,,y,,10.00,,,,,3.5', 'c,C,,,,,z,,10.00,,,,,-1']),
		)

		expect(result.groups.find((g) => g.productSlug === 'a')?.variants[0].initialStock).toBe(0)
		expect(result.rowErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ line: 3, column: 'initial_stock', code: 'INVALID_STOCK' }),
				expect.objectContaining({ line: 4, column: 'initial_stock', code: 'INVALID_STOCK' }),
			]),
		)
	})

	test('a non-numeric price is a row error', () => {
		const result = parseProductImportCsv(csv([HEADER, 'a,A,,,,,x,,abc,,,,,0']))

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ line: 2, column: 'price', code: 'INVALID_PRICE' }),
		])
	})

	test('missing product_slug / product_name / variant_name / price each produce a row error with the column', () => {
		const result = parseProductImportCsv(
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
				expect.objectContaining({
					line: 2,
					column: 'product_slug',
					code: 'MISSING_REQUIRED_FIELD',
				}),
				expect.objectContaining({
					line: 3,
					column: 'product_name',
					code: 'MISSING_REQUIRED_FIELD',
				}),
				expect.objectContaining({
					line: 4,
					column: 'variant_name',
					code: 'MISSING_REQUIRED_FIELD',
				}),
				expect.objectContaining({ line: 5, column: 'price', code: 'MISSING_REQUIRED_FIELD' }),
			]),
		)
	})

	test('rows of the same group disagreeing on an editorial field are a row error', () => {
		const result = parseProductImportCsv(
			csv([
				HEADER,
				'racao,Racao Premium,,Golden,,,10kg,,10.00,,,,,0',
				'racao,Racao Diferente,,Golden,,,15kg,,12.00,,,,,0',
			]),
		)

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ line: 3, column: 'product_name', code: 'GROUP_FIELD_CONFLICT' }),
		])
	})

	test('a duplicate sku across two rows in the file is a row error on the second occurrence', () => {
		const result = parseProductImportCsv(
			csv([HEADER, 'a,A,,,,,x,SKU-1,10.00,,,,,0', 'b,B,,,,,y,SKU-1,10.00,,,,,0']),
		)

		expect(result.rowErrors).toEqual([
			expect.objectContaining({ line: 3, column: 'sku', code: 'DUPLICATE_SKU_IN_FILE' }),
		])
	})

	test('handles CRLF line endings and quoted fields containing the delimiter', () => {
		const result = parseProductImportCsv(
			Buffer.from(
				`${HEADER}\r\nracao,"Racao, Premium","Uma descricao, com virgula",,Caes,,10kg,,"1.199,90",,,,,0\r\n`,
				'utf-8',
			),
		)

		expect(result.fileErrors).toEqual([])
		expect(result.rowErrors).toEqual([])
		expect(result.groups[0].productName).toBe('Racao, Premium')
		expect(result.groups[0].description).toBe('Uma descricao, com virgula')
		expect(result.groups[0].variants[0].priceCents).toBe(119990)
	})
})
