import { BarcodeNotInDraftError } from '@/domain/quintalpet/application/use-cases/errors/barcode-not-in-draft-error'
import { EmptySaleDraftError } from '@/domain/quintalpet/application/use-cases/errors/empty-sale-draft-error'
import { FavoriteProductNotAvailableError } from '@/domain/quintalpet/application/use-cases/errors/favorite-product-not-available-error'
import { InvalidHomeOfferSelectionError } from '@/domain/quintalpet/application/use-cases/errors/invalid-home-offer-selection-error'
import { OrderItemUnavailableError } from '@/domain/quintalpet/application/use-cases/errors/order-item-unavailable-error'
import { OrderPlacementConflictError } from '@/domain/quintalpet/application/use-cases/errors/order-placement-conflict-error'
import { SaleDraftAlreadyActiveError } from '@/domain/quintalpet/application/use-cases/errors/sale-draft-already-active-error'
import { StoreCustomerConflictError } from '@/domain/quintalpet/application/use-cases/errors/store-customer-conflict-error'
import { VariantBarcodeAlreadySetError } from '@/domain/quintalpet/application/use-cases/errors/variant-barcode-already-set-error'
import { VariantNotFoundError } from '@/domain/quintalpet/application/use-cases/errors/variant-not-found-error'
import {
	CatalogConflictError,
	CatalogValidationError,
} from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { ArchivedCatalogEntityError } from '@/domain/quintalpet/enterprise/errors/archived-catalog-entity-error'
import { CategoryCycleError } from '@/domain/quintalpet/enterprise/errors/category-cycle-error'
import { DuplicateMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/duplicate-merchandising-reference-error'
import { InactiveCategoryAssignmentError } from '@/domain/quintalpet/enterprise/errors/inactive-category-assignment-error'
import { InvalidCatalogLifecycleTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-catalog-lifecycle-transition-error'
import { InvalidDeliveryOptionError } from '@/domain/quintalpet/enterprise/errors/invalid-delivery-option-error'
import { InvalidInventoryQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-inventory-quantity-error'
import { InvalidMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/invalid-merchandising-reference-error'
import { InvalidOrderCustomerIdentityError } from '@/domain/quintalpet/enterprise/errors/invalid-order-customer-identity-error'
import { InvalidOrderTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-order-transition-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import { InvalidPrimaryCategoryError } from '@/domain/quintalpet/enterprise/errors/invalid-primary-category-error'
import { InvalidPromotionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-error'
import { InvalidPromotionPayloadError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-payload-error'
import { InvalidPromotionTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-transition-error'
import { InvalidSaleDraftQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-sale-draft-quantity-error'
import { InvalidShippingSettingsError } from '@/domain/quintalpet/enterprise/errors/invalid-shipping-settings-error'
import { InvalidStoreCustomerTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-store-customer-transition-error'
import { InvalidVariantPricingError } from '@/domain/quintalpet/enterprise/errors/invalid-variant-pricing-error'
import { MerchandisingLimitExceededError } from '@/domain/quintalpet/enterprise/errors/merchandising-limit-exceeded-error'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { SaleDraftItemNotFoundError } from '@/domain/quintalpet/enterprise/errors/sale-draft-item-not-found-error'
import { SaleDraftNotEmptyError } from '@/domain/quintalpet/enterprise/errors/sale-draft-not-empty-error'
import { StalePdvSessionRequiresConfirmationError } from '@/domain/quintalpet/enterprise/errors/stale-pdv-session-requires-confirmation-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { translateDomainError } from './domain-error-messages'

/**
 * Central domain-error -> HTTP-status map. Grows as later tasks wire more
 * controllers onto `throwTranslatedDomainError`; a status change for an
 * error class already listed here is a regression, not a refactor — see
 * docs/tasks/friendly-errors/README.md's risk plan.
 *
 * Covers PDV's classifications (T2), inventory and merchandising (T3),
 * catalog (T4), customers (T5), and orders (T6).
 */
export const domainErrorStatusCodes = new Map<Function, number>([
	// 409 Conflict
	[PdvSessionAlreadyOpenError, 409],
	[StalePdvSessionRequiresConfirmationError, 409],
	[SaleDraftAlreadyActiveError, 409],

	// 409 Conflict — catalog (T4)
	[CatalogConflictError, 409],

	// 404 Not Found — customers (T5)
	[FavoriteProductNotAvailableError, 404],

	// 400 Bad Request
	[VariantNotFoundError, 400],
	[SaleDraftItemNotFoundError, 400],
	[InvalidSaleDraftQuantityError, 400],
	[OrderItemUnavailableError, 400],
	[EmptySaleDraftError, 400],
	[InvalidOrderCustomerIdentityError, 400],
	[OrderPlacementConflictError, 400],
	[BarcodeNotInDraftError, 400],
	[VariantBarcodeAlreadySetError, 400],
	[SaleDraftNotEmptyError, 400],

	// 400 Bad Request — inventory (T3)
	[InvalidInventoryQuantityError, 400],
	[NegativeInventoryBalanceError, 400],

	// 400 Bad Request — merchandising (T3)
	[MerchandisingLimitExceededError, 400],
	[DuplicateMerchandisingReferenceError, 400],
	[InvalidMerchandisingReferenceError, 400],

	// 400 Bad Request — catalog (T4)
	[CatalogValidationError, 400],
	[ArchivedCatalogEntityError, 400],
	[CategoryCycleError, 400],
	[InactiveCategoryAssignmentError, 400],
	[InvalidPrimaryCategoryError, 400],
	[InvalidCatalogLifecycleTransitionError, 400],
	[InvalidVariantPricingError, 400],

	// 400 Bad Request — customers (T5)
	[InvalidStoreCustomerTransitionError, 400],
	[StoreCustomerAddressNotFoundError, 400],
	[StoreCustomerConflictError, 400],

	// 400 Bad Request — orders (T6)
	[InvalidOrderTransitionError, 400],
	[InvalidDeliveryOptionError, 400],

	// 400 Bad Request — shipping (distance-based delivery fee)
	[InvalidPostalCodeError, 400],
	[InvalidShippingSettingsError, 400],

	// 400 Bad Request — promotions (admin management + home curation)
	[InvalidPromotionError, 400],
	[InvalidPromotionPayloadError, 400],
	[InvalidPromotionTransitionError, 400],
	[InvalidHomeOfferSelectionError, 400],
])

/**
 * Looks up a caught error's HTTP status in `domainErrorStatusCodes` and
 * throws the matching NestJS `HttpException` subclass with a body of
 * `{ code, message }` from `translateDomainError`, falling back to
 * `{ message: error.message }` when there's no translation entry.
 *
 * If the error's class isn't in the status map at all, it is rethrown
 * unchanged — callers further up (or NestJS's default exception filter)
 * decide what to do with it.
 */
export function throwTranslatedDomainError(error: unknown): never {
	const status = error instanceof Error ? domainErrorStatusCodes.get(error.constructor) : undefined

	if (status === undefined) {
		throw error
	}

	const body = translateDomainError(error) ?? { message: (error as Error).message }

	switch (status) {
		case 400:
			throw new BadRequestException(body)
		case 404:
			throw new NotFoundException(body)
		case 409:
			throw new ConflictException(body)
		default:
			throw error
	}
}
