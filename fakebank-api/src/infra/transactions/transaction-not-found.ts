import { HttpException, HttpStatus } from '@nestjs/common'

/** Unknown id, or another Client's: both answer the same 404. */
export function transactionNotFound(): HttpException {
	return new HttpException(
		{ code: 'TRANSACTION_NOT_FOUND', message: 'The Provider Transaction was not found.' },
		HttpStatus.NOT_FOUND,
	)
}
