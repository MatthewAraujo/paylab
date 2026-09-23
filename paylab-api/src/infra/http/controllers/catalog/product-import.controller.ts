import { CsvImportValidationError } from '@/domain/quintalpet/application/use-cases/errors/csv-import-validation-error'
import { ImportCatalogProductsUseCase } from '@/domain/quintalpet/application/use-cases/import-catalog-products'
import { PRODUCT_IMPORT_COLUMNS } from '@/domain/quintalpet/enterprise/services/csv/product-import-columns'
import { MAX_IMPORT_BYTES } from '@/domain/quintalpet/enterprise/services/csv/product-import-limits'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import {
	Controller,
	Get,
	Header,
	HttpCode,
	HttpStatus,
	MaxFileSizeValidator,
	ParseFilePipe,
	Post,
	UnprocessableEntityException,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

const TEMPLATE_FILENAME = 'modelo-importacao-produtos.csv'
const TEMPLATE_TRANSLATED_COLUMNS =
	'# slug do produto,nome do produto,descrição,marca,categoria principal,subcategoria,nome da variante,sku,preço,custo,código de barras,peso,estoque inicial'
const TEMPLATE_EXAMPLE_ROW =
	'racao-premium-caes,Ração Premium Cães,"Ração super premium para cães adultos",Golden,Cães,Rações,10kg,,199.90,,7891234567890,10kg,25'

@Controller('/api/v1/admin/catalog/products')
@StoreMemberOnly()
export class ProductImportController {
	constructor(private readonly importCatalogProducts: ImportCatalogProductsUseCase) {}

	@Post('/import')
	@HttpCode(200)
	@UseInterceptors(FileInterceptor('file'))
	async import(
		@CurrentStoreId() storeId: string,
		@UploadedFile(
			new ParseFilePipe({
				errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
				validators: [new MaxFileSizeValidator({ maxSize: MAX_IMPORT_BYTES })],
			}),
		)
		file: Express.Multer.File,
	) {
		try {
			const imported = await this.importCatalogProducts.execute(storeId, file.buffer)
			return { imported }
		} catch (error) {
			if (error instanceof CsvImportValidationError) {
				// A structured body (rowErrors / fileErrors), so it's mapped inline
				// here rather than through the flat `{ code, message }` shared table.
				throw new UnprocessableEntityException({
					error: 'import_validation_failed',
					rowErrors: error.rowErrors,
					fileErrors: error.fileErrors,
				})
			}
			throw error
		}
	}

	@Get('/import/template')
	@Header('Content-Type', 'text/csv; charset=utf-8')
	@Header('Content-Disposition', `attachment; filename="${TEMPLATE_FILENAME}"`)
	template(): string {
		return `${TEMPLATE_TRANSLATED_COLUMNS}\n${PRODUCT_IMPORT_COLUMNS.join(',')}\n${TEMPLATE_EXAMPLE_ROW}\n`
	}
}
