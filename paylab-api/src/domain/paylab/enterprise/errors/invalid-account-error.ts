import { UseCaseError } from '@/core/errors/use-case-error'

export class InvalidAccountError extends Error implements UseCaseError {}
