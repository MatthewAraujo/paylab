import { PRODUCT_IMPORT_COLUMNS, REQUIRED_PRODUCT_IMPORT_COLUMNS } from './product-import-columns'

/**
 * Pure CSV parser for the bulk product import. No HTTP, no DB — it turns an
 * uploaded buffer into grouped product structs plus any format-level errors.
 * Delimiter (`,` / `;`) and encoding (UTF-8 / latin1) are auto-detected because
 * those are the two things Brazilian Excel exports vary. See ADR 0008 / T1.
 */

export interface CsvRowError {
	line: number
	column?: string
	code: string
	message: string
}

export interface CsvFileError {
	code: string
	message: string
}

export interface VariantRow {
	line: number
	variantName: string
	sku?: string
	priceCents: number
	costCents?: number
	barcode?: string
	/**
	 * The only supported variant attribute: weight (`peso`), free text like
	 * `"10kg"` / `"500g"`. Stored on the variant as `{ weight }`; empty when the
	 * `weight` column is blank.
	 */
	attributes: Record<string, string>
	initialStock: number
}

export interface ProductImportGroup {
	productSlug: string
	productName: string
	description?: string
	brand?: string
	primaryCategory?: string
	categories: string[]
	firstLine: number
	variants: VariantRow[]
}

export interface ParsedProductImportCsv {
	groups: ProductImportGroup[]
	rowErrors: CsvRowError[]
	fileErrors: CsvFileError[]
	dataRowCount: number
}

const EDITORIAL_COLUMNS = [
	'product_name',
	'description',
	'brand',
	'primary_category',
	'subcategory',
] as const

export function detectDelimiter(headerLine: string): ',' | ';' {
	let commas = 0
	let semicolons = 0

	for (const char of headerLine) {
		if (char === ',') commas += 1
		if (char === ';') semicolons += 1
	}

	return semicolons > commas ? ';' : ','
}

export function decodeBuffer(buffer: Buffer): string {
	try {
		return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
	} catch {
		return stripBom(buffer.toString('latin1'))
	}
}

export function parseProductImportCsv(buffer: Buffer): ParsedProductImportCsv {
	const text = decodeBuffer(buffer)
	const logicalLines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
	const headerLine = logicalLines[0] ?? ''
	const delimiter = detectDelimiter(headerLine)

	const records = splitRecords(text, delimiter)
	const headerRecordIndex = records.findIndex(
		(record) =>
			record.some((cell) => cell.trim() !== '') && !(record[0]?.trim() ?? '').startsWith('#'),
	)
	const contentRecords = records.filter(
		(record) => record.some((cell) => cell.trim() !== '') && !record[0]?.trim().startsWith('#'),
	)
	const rowErrors: CsvRowError[] = []
	const fileErrors: CsvFileError[] = []

	if (contentRecords.length === 0) {
		fileErrors.push({ code: 'EMPTY_FILE', message: 'O arquivo está vazio.' })
		return { groups: [], rowErrors, fileErrors, dataRowCount: 0 }
	}

	const header = contentRecords[0].map((cell) => cell.trim().toLowerCase())
	const missingColumns = REQUIRED_PRODUCT_IMPORT_COLUMNS.filter((name) => !header.includes(name))

	if (missingColumns.length > 0) {
		fileErrors.push({
			code: 'MISSING_COLUMNS',
			message: `Colunas obrigatórias ausentes no cabeçalho: ${missingColumns.join(', ')}.`,
		})
		return { groups: [], rowErrors, fileErrors, dataRowCount: 0 }
	}

	const columnIndex = new Map<string, number>()
	for (const name of PRODUCT_IMPORT_COLUMNS) {
		const index = header.indexOf(name)
		if (index !== -1) columnIndex.set(name, index)
	}

	const groupMap = new Map<string, ProductImportGroup>()
	const groupOrder: string[] = []
	const seenSkus = new Map<string, number>()

	let dataRowCount = 0

	for (let recordIndex = headerRecordIndex + 1; recordIndex < records.length; recordIndex += 1) {
		const record = records[recordIndex]
		const firstCell = record[0]?.trim() ?? ''

		if (record.every((cell) => cell.trim() === '') || firstCell.startsWith('#')) {
			continue
		}

		const line = recordIndex + 1

		dataRowCount += 1

		const cell = (name: string) => {
			const index = columnIndex.get(name)
			return index === undefined ? '' : (record[index] ?? '').trim()
		}

		const productSlug = cell('product_slug')

		if (!productSlug) {
			rowErrors.push(missingFieldError(line, 'product_slug'))
			continue
		}

		let group = groupMap.get(productSlug)
		const isFirstRowOfGroup = group === undefined

		if (!group) {
			group = {
				productSlug,
				productName: '',
				description: undefined,
				brand: undefined,
				primaryCategory: undefined,
				categories: [],
				firstLine: line,
				variants: [],
			}
			groupMap.set(productSlug, group)
			groupOrder.push(productSlug)
		}

		const productName = cell('product_name')

		if (isFirstRowOfGroup) {
			group.productName = productName
			group.description = cell('description') || undefined
			group.brand = cell('brand') || undefined
			group.primaryCategory = cell('primary_category') || undefined
			group.categories = splitSubcategory(cell('subcategory'))

			if (!productName) {
				rowErrors.push(missingFieldError(group.firstLine, 'product_name'))
			}
		} else {
			for (const column of EDITORIAL_COLUMNS) {
				const raw = cell(column)
				if (raw === '') continue

				if (!editorialCellMatchesGroup(column, raw, group)) {
					rowErrors.push({
						line,
						column,
						code: 'GROUP_FIELD_CONFLICT',
						message: `Linha ${line}: o valor de "${column}" difere do informado na primeira linha do produto "${productSlug}".`,
					})
				}
			}
		}

		const variantName = cell('variant_name')
		if (!variantName) {
			rowErrors.push(missingFieldError(line, 'variant_name'))
		}

		const sku = cell('sku') || undefined
		if (sku) {
			const normalized = sku.toUpperCase()
			if (seenSkus.has(normalized)) {
				rowErrors.push({
					line,
					column: 'sku',
					code: 'DUPLICATE_SKU_IN_FILE',
					message: `Linha ${line}: o SKU "${sku}" já aparece na linha ${seenSkus.get(normalized)}.`,
				})
			} else {
				seenSkus.set(normalized, line)
			}
		}

		const price = parsePriceCents(cell('price'))
		if (price.state === 'missing') {
			rowErrors.push(missingFieldError(line, 'price'))
		} else if (price.state === 'invalid') {
			rowErrors.push(priceError(line, 'price', cell('price')))
		}

		if (/[>|]/.test(cell('subcategory'))) {
			rowErrors.push({
				line,
				column: 'subcategory',
				code: 'INVALID_SUBCATEGORY_FORMAT',
				message: `Linha ${line}: subcategory deve conter apenas um nome simples.`,
			})
		}

		const cost = parseOptionalPrice(line, 'cost', cell('cost'), rowErrors)

		const stock = parseInitialStock(cell('initial_stock'))
		if (stock.state === 'invalid') {
			rowErrors.push({
				line,
				column: 'initial_stock',
				code: 'INVALID_STOCK',
				message: `Linha ${line}: estoque inicial inválido ("${cell('initial_stock')}"). Use um inteiro não negativo.`,
			})
		}

		const weight = cell('weight')

		if (!variantName || price.state !== 'ok' || stock.state === 'invalid') {
			continue
		}

		group.variants.push({
			line,
			variantName,
			sku,
			priceCents: price.cents,
			costCents: cost ?? undefined,
			barcode: cell('barcode') || undefined,
			attributes: weight ? { weight } : {},
			initialStock: stock.value,
		})
	}

	if (dataRowCount === 0) {
		fileErrors.push({ code: 'EMPTY_FILE', message: 'O arquivo não contém nenhuma linha de dados.' })
	}

	return {
		groups: groupOrder.map((slug) => groupMap.get(slug) as ProductImportGroup),
		rowErrors,
		fileErrors,
		dataRowCount,
	}
}

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function splitRecords(text: string, delimiter: string): string[][] {
	const records: string[][] = []
	let field = ''
	let record: string[] = []
	let inQuotes = false
	let started = false

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i]

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"'
					i += 1
				} else {
					inQuotes = false
				}
			} else {
				field += char
			}
			continue
		}

		if (char === '"') {
			inQuotes = true
			started = true
			continue
		}

		if (char === delimiter) {
			record.push(field)
			field = ''
			started = true
			continue
		}

		if (char === '\r') {
			continue
		}

		if (char === '\n') {
			record.push(field)
			records.push(record)
			record = []
			field = ''
			started = false
			continue
		}

		field += char
		started = true
	}

	if (started || field !== '' || record.length > 0) {
		record.push(field)
		records.push(record)
	}

	return records
}

function splitSubcategory(raw: string): string[] {
	const value = raw.trim()
	return value ? [value] : []
}

function editorialCellMatchesGroup(
	column: (typeof EDITORIAL_COLUMNS)[number],
	raw: string,
	group: ProductImportGroup,
): boolean {
	switch (column) {
		case 'product_name':
			return raw === group.productName
		case 'description':
			return raw === (group.description ?? '')
		case 'brand':
			return raw === (group.brand ?? '')
		case 'primary_category':
			return raw === (group.primaryCategory ?? '')
		case 'subcategory':
			return arraysEqual(splitSubcategory(raw), group.categories)
	}
}

function arraysEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index])
}

function missingFieldError(line: number, column: string): CsvRowError {
	return {
		line,
		column,
		code: 'MISSING_REQUIRED_FIELD',
		message: `Linha ${line}: o campo "${column}" é obrigatório.`,
	}
}

function priceError(line: number, column: string, raw: string): CsvRowError {
	return {
		line,
		column,
		code: 'INVALID_PRICE',
		message: `Linha ${line}: valor monetário inválido em "${column}" ("${raw}").`,
	}
}

type PriceResult = { state: 'ok'; cents: number } | { state: 'missing' } | { state: 'invalid' }

function parsePriceCents(raw: string): PriceResult {
	if (raw === '') return { state: 'missing' }

	let normalized = raw
	const hasComma = normalized.includes(',')
	const hasDot = normalized.includes('.')

	if (hasComma && hasDot) {
		normalized = normalized.replace(/\./g, '').replace(',', '.')
	} else if (hasComma) {
		normalized = normalized.replace(',', '.')
	}

	if (!/^\d+(\.\d+)?$/.test(normalized)) {
		return { state: 'invalid' }
	}

	const amount = Number(normalized)
	if (!Number.isFinite(amount) || amount < 0) {
		return { state: 'invalid' }
	}

	return { state: 'ok', cents: Math.round(amount * 100) }
}

function parseOptionalPrice(
	line: number,
	column: string,
	raw: string,
	rowErrors: CsvRowError[],
): number | null {
	if (raw === '') return null

	const parsed = parsePriceCents(raw)
	if (parsed.state === 'ok') return parsed.cents

	rowErrors.push(priceError(line, column, raw))
	return null
}

type StockResult = { state: 'ok'; value: number } | { state: 'invalid' }

function parseInitialStock(raw: string): StockResult {
	if (raw === '') return { state: 'ok', value: 0 }
	if (!/^-?\d+$/.test(raw)) return { state: 'invalid' }

	const value = Number.parseInt(raw, 10)
	if (value < 0) return { state: 'invalid' }

	return { state: 'ok', value }
}
