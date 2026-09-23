import { UseCaseError } from '@/core/errors/use-case-error'

export class InvalidPaymentError extends Error implements UseCaseError {}
