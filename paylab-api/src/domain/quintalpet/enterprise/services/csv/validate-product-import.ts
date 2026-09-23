import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'
import {
	type CsvFileError,
	type CsvRowError,
	type ParsedProductImportCsv,
	type ProductImportGroup,
	parseProductImportCsv,
} from './parse-product-import-csv'
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from './product-import-limits'

export type ValidatedProductImport = ParsedProductImportCsv

/**
 * Pure, DB-free validation for the bulk product import. Runs the parser (T1),
 * then layers the file caps and cross-row slug-collision checks on top. The
 * store-level checks (`product_slug` / `sku` / `barcode` already in the store)
 * are DB-bound and live in the import use case (T3); they append to the same
 * `rowErrors` list and throw the same `CsvImportValidationError`.
 */
export function validateProductImport(buffer: Buffer): ValidatedProductImport {
	const parsed = parseProductImportCsv(buffer)
	const rowErrors: CsvRowError[] = [...parsed.rowErrors]
	const fileErrors: CsvFileError[] = [...parsed.fileErrors]

	if (buffer.length > MAX_IMPORT_BYTES) {
		fileErrors.push({
			code: 'FILE_TOO_LARGE',
			message: `O arquivo excede o limite de ${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} MB. Divida-o em arquivos menores.`,
		})
	}

	if (parsed.dataRowCount > MAX_IMPORT_ROWS) {
		fileErrors.push({
			code: 'TOO_MANY_ROWS',
			message: `O arquivo tem ${parsed.dataRowCount} linhas de dados, acima do limite de ${MAX_IMPORT_ROWS}. Divida-o em arquivos menores.`,
		})
	}

	rowErrors.push(...detectAmbiguousSlugs(parsed.groups))

	return {
		groups: parsed.groups,
		rowErrors,
		fileErrors,
		dataRowCount: parsed.dataRowCount,
	}
}

function detectAmbiguousSlugs(groups: ProductImportGroup[]): CsvRowError[] {
	const errors: CsvRowError[] = []
	const brandSlugs = new Map<string, string>()

	const check = (
		map: Map<string, string>,
		name: string,
		slug: string,
		line: number,
		column: string,
	) => {
		const seen = map.get(slug)
		if (seen === undefined) {
			map.set(slug, name)
			return
		}
		if (seen !== name) {
			errors.push({
				line,
				column,
				code: 'AMBIGUOUS_SLUG',
				message: `Linha ${line}: "${name}" e "${seen}" geram o mesmo identificador ("${slug}"). Padronize o nome.`,
			})
		}
	}

	for (const group of groups) {
		if (group.brand) {
			check(
				brandSlugs,
				group.brand,
				CatalogSlug.createFromText(group.brand).value,
				group.firstLine,
				'brand',
			)
		}
	}

	return errors
}
