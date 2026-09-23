import type {
	CsvFileError,
	CsvRowError,
} from '@/domain/quintalpet/enterprise/services/csv/parse-product-import-csv'

/**
 * Raised when a bulk product import CSV fails validation — either format-level
 * problems from the parser (T1), the row/file rules in `validateProductImport`
 * (T2), or the store-level duplicate checks the import use case runs inside its
 * transaction (T3). Carries the structured lists the controller turns into the
 * `422 { error: 'import_validation_failed', rowErrors, fileErrors }` body.
 * Nothing is ever persisted when this is thrown.
 */
export class CsvImportValidationError extends Error {
	constructor(
		readonly rowErrors: CsvRowError[],
		readonly fileErrors: CsvFileError[],
	) {
		super('CSV product import validation failed.')
		this.name = 'CsvImportValidationError'
	}
}
