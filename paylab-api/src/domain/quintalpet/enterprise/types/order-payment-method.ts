export enum OrderPaymentMethod {
	PIX = 'PIX',
	CREDIT_CARD = 'CREDIT_CARD',
	// Added for PDV walk-in sales (ADR 0003 / PRD-PDV): the most common
	// in-person payment method at the counter. Prisma's OrderPaymentMethod
	// enum (T1) already includes this value; this domain type had not been
	// updated to match until T7.
	CASH = 'CASH',
}
