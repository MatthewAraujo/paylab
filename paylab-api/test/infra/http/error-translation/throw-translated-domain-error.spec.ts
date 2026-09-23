import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
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
import { InactiveCategoryAssignmentError } from '@/domain/quintalpet/enterprise/errors/inactive-category-assignment-error'
import { InvalidCatalogLifecycleTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-catalog-lifecycle-transition-error'
import { InvalidDeliveryOptionError } from '@/domain/quintalpet/enterprise/errors/invalid-delivery-option-error'
import { InvalidOrderCustomerIdentityError } from '@/domain/quintalpet/enterprise/errors/invalid-order-customer-identity-error'
import { InvalidOrderTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-order-transition-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import { InvalidPrimaryCategoryError } from '@/domain/quintalpet/enterprise/errors/invalid-primary-category-error'
import { InvalidPromotionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-error'
import { InvalidPromotionPayloadError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-payload-error'
import { InvalidPromotionTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-transition-error'
import { InvalidSaleDraftQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-sale-draft-quantity-error'
import { InvalidStoreCustomerTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-store-customer-transition-error'
import { InvalidVariantPricingError } from '@/domain/quintalpet/enterprise/errors/invalid-variant-pricing-error'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { SaleDraftItemNotFoundError } from '@/domain/quintalpet/enterprise/errors/sale-draft-item-not-found-error'
import { SaleDraftNotEmptyError } from '@/domain/quintalpet/enterprise/errors/sale-draft-not-empty-error'
import { StalePdvSessionRequiresConfirmationError } from '@/domain/quintalpet/enterprise/errors/stale-pdv-session-requires-confirmation-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import {
	BadRequestException,
	ConflictException,
	HttpException,
	NotFoundException,
} from '@nestjs/common'

function captureThrow(fn: () => never): HttpException {
	try {
		fn()
	} catch (error) {
		if (error instanceof HttpException) {
			return error
		}
		throw error
	}
	throw new Error('Expected throwTranslatedDomainError to throw')
}

describe('throwTranslatedDomainError', () => {
	test('PdvSessionAlreadyOpenError -> 409 PDV_SESSION_ALREADY_OPEN', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new PdvSessionAlreadyOpenError()))

		expect(thrown).toBeInstanceOf(ConflictException)
		expect(thrown.getStatus()).toBe(409)
		expect(thrown.getResponse()).toEqual({
			code: 'PDV_SESSION_ALREADY_OPEN',
			message: 'Já existe uma sessão de PDV aberta para esta loja hoje.',
		})
	})

	test('StalePdvSessionRequiresConfirmationError -> 409 PDV_STALE_SESSION (stable cross-repo contract code)', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new StalePdvSessionRequiresConfirmationError()),
		)

		expect(thrown).toBeInstanceOf(ConflictException)
		expect(thrown.getStatus()).toBe(409)
		expect(thrown.getResponse()).toEqual({
			code: 'PDV_STALE_SESSION',
			message:
				'Existe uma sessão de PDV aberta de um dia anterior. Confirme a substituição para abrir uma nova sessão.',
		})
	})

	test('SaleDraftAlreadyActiveError -> 409 SALE_DRAFT_ALREADY_ACTIVE', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new SaleDraftAlreadyActiveError()))

		expect(thrown).toBeInstanceOf(ConflictException)
		expect(thrown.getStatus()).toBe(409)
		expect(thrown.getResponse()).toEqual({
			code: 'SALE_DRAFT_ALREADY_ACTIVE',
			message: 'Esta sessão de PDV já possui uma venda em andamento.',
		})
	})

	test('VariantNotFoundError -> 400 VARIANT_NOT_FOUND', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new VariantNotFoundError('11111111-1111-1111-1111-111111111111')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'VARIANT_NOT_FOUND',
			message: 'Produto ou variante não encontrado ou não está mais ativo.',
		})
	})

	test('SaleDraftItemNotFoundError -> 400 SALE_DRAFT_ITEM_NOT_FOUND', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(
				new SaleDraftItemNotFoundError('22222222-2222-2222-2222-222222222222'),
			),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'SALE_DRAFT_ITEM_NOT_FOUND',
			message: 'Não há nenhum item correspondente para este produto nesta venda.',
		})
	})

	test('InvalidSaleDraftQuantityError -> 400 INVALID_SALE_DRAFT_QUANTITY', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidSaleDraftQuantityError()),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_SALE_DRAFT_QUANTITY',
			message: 'Não é possível reduzir um item da venda para uma quantidade abaixo de zero.',
		})
	})

	test('OrderItemUnavailableError -> 400 ORDER_ITEM_UNAVAILABLE', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(
				new OrderItemUnavailableError('33333333-3333-3333-3333-333333333333'),
			),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'ORDER_ITEM_UNAVAILABLE',
			message: 'Não há quantidade suficiente em estoque para um dos itens do pedido.',
		})
	})

	test('EmptySaleDraftError -> 400 EMPTY_SALE_DRAFT', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new EmptySaleDraftError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'EMPTY_SALE_DRAFT',
			message: 'Não é possível finalizar uma venda sem itens.',
		})
	})

	test('InvalidOrderCustomerIdentityError -> 400 INVALID_ORDER_CUSTOMER_IDENTITY', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidOrderCustomerIdentityError()),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_ORDER_CUSTOMER_IDENTITY',
			message:
				'Um pedido deve ter um cliente cadastrado ou um nome e telefone de convidado, mas não ambos.',
		})
	})

	test('OrderPlacementConflictError -> 400 ORDER_PLACEMENT_CONFLICT', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new OrderPlacementConflictError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'ORDER_PLACEMENT_CONFLICT',
			message: 'Não foi possível confirmar o estoque para este pedido. Tente novamente.',
		})
	})

	test('BarcodeNotInDraftError -> 400 BARCODE_NOT_IN_DRAFT', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new BarcodeNotInDraftError('7891234567890')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'BARCODE_NOT_IN_DRAFT',
			message: 'Este código de barras não corresponde a nenhum item pendente nesta venda.',
		})
	})

	test('VariantBarcodeAlreadySetError -> 400 VARIANT_BARCODE_ALREADY_SET', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(
				new VariantBarcodeAlreadySetError('44444444-4444-4444-4444-444444444444'),
			),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'VARIANT_BARCODE_ALREADY_SET',
			message: 'Este código de barras já está vinculado a outro produto.',
		})
	})

	test('SaleDraftNotEmptyError -> 400 SALE_DRAFT_NOT_EMPTY', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new SaleDraftNotEmptyError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'SALE_DRAFT_NOT_EMPTY',
			message: 'Não é possível fechar uma sessão de PDV enquanto a venda ativa ainda tiver itens.',
		})
	})

	test('CatalogConflictError -> 409 CATALOG_CONFLICT', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(
				new CatalogConflictError('Brand slug already exists in this store.'),
			),
		)

		expect(thrown).toBeInstanceOf(ConflictException)
		expect(thrown.getStatus()).toBe(409)
		expect(thrown.getResponse()).toEqual({
			code: 'CATALOG_CONFLICT',
			message:
				'Já existe um registro de catálogo com esses dados. Verifique as informações e tente novamente.',
		})
	})

	test('CatalogValidationError -> 400 CATALOG_VALIDATION_ERROR', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new CatalogValidationError('Unsupported product status.')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'CATALOG_VALIDATION_ERROR',
			message:
				'Os dados informados para o catálogo são inválidos. Verifique as informações e tente novamente.',
		})
	})

	test('ArchivedCatalogEntityError -> 400 ARCHIVED_CATALOG_ENTITY', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new ArchivedCatalogEntityError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'ARCHIVED_CATALOG_ENTITY',
			message: 'Itens arquivados do catálogo não podem ser editados.',
		})
	})

	test('CategoryCycleError -> 400 CATEGORY_CYCLE', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new CategoryCycleError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'CATEGORY_CYCLE',
			message: 'Não é possível criar um ciclo entre categorias.',
		})
	})

	test('InactiveCategoryAssignmentError -> 400 INACTIVE_CATEGORY_ASSIGNMENT', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InactiveCategoryAssignmentError()),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INACTIVE_CATEGORY_ASSIGNMENT',
			message: 'Categorias inativas ou arquivadas não podem ser atribuídas a produtos.',
		})
	})

	test('InvalidPrimaryCategoryError -> 400 INVALID_PRIMARY_CATEGORY', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new InvalidPrimaryCategoryError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_PRIMARY_CATEGORY',
			message: 'A categoria principal deve estar entre as categorias atribuídas.',
		})
	})

	test('InvalidCatalogLifecycleTransitionError -> 400 INVALID_CATALOG_LIFECYCLE_TRANSITION', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidCatalogLifecycleTransitionError()),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_CATALOG_LIFECYCLE_TRANSITION',
			message: 'Transição de status do catálogo inválida.',
		})
	})

	test('InvalidVariantPricingError -> 400 INVALID_VARIANT_PRICING', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new InvalidVariantPricingError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_VARIANT_PRICING',
			message: 'O preço da variante é inválido.',
		})
	})

	test('FavoriteProductNotAvailableError -> 404 FAVORITE_PRODUCT_NOT_AVAILABLE', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new FavoriteProductNotAvailableError('racao-premium')),
		)

		expect(thrown).toBeInstanceOf(NotFoundException)
		expect(thrown.getStatus()).toBe(404)
		expect(thrown.getResponse()).toEqual({
			code: 'FAVORITE_PRODUCT_NOT_AVAILABLE',
			message: 'O produto "racao-premium" não está disponível para favoritar nesta loja.',
		})
	})

	test('InvalidStoreCustomerTransitionError -> 400 INVALID_STORE_CUSTOMER_TRANSITION', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidStoreCustomerTransitionError()),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_STORE_CUSTOMER_TRANSITION',
			message: 'Transição de status do cliente inválida.',
		})
	})

	test('StoreCustomerAddressNotFoundError -> 400 STORE_CUSTOMER_ADDRESS_NOT_FOUND', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new StoreCustomerAddressNotFoundError()),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'STORE_CUSTOMER_ADDRESS_NOT_FOUND',
			message: 'Endereço do cliente não encontrado.',
		})
	})

	test('StoreCustomerConflictError -> 400 STORE_CUSTOMER_CONFLICT', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(
				new StoreCustomerConflictError('Customer already exists for this store.'),
			),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'STORE_CUSTOMER_CONFLICT',
			message: 'Já existe um cliente cadastrado para esta loja com esses dados.',
		})
	})

	test('InvalidPostalCodeError -> 400 INVALID_POSTAL_CODE', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new InvalidPostalCodeError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_POSTAL_CODE',
			message: 'CEP inválido ou não encontrado.',
		})
	})

	test('InvalidOrderTransitionError -> 400 INVALID_ORDER_TRANSITION', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new InvalidOrderTransitionError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_ORDER_TRANSITION',
			message: 'Transição de status do pedido inválida.',
		})
	})

	test('InvalidDeliveryOptionError -> 400 INVALID_DELIVERY_OPTION', () => {
		const thrown = captureThrow(() => throwTranslatedDomainError(new InvalidDeliveryOptionError()))

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_DELIVERY_OPTION',
			message: 'Opção de entrega desconhecida.',
		})
	})

	test('InvalidPromotionError -> 400 INVALID_PROMOTION', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidPromotionError('name is required')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_PROMOTION',
			message: 'Os dados informados para a promoção são inválidos. Verifique e tente novamente.',
		})
	})

	test('InvalidPromotionPayloadError -> 400 INVALID_PROMOTION_PAYLOAD', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidPromotionPayloadError('benefit #0 is invalid')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_PROMOTION_PAYLOAD',
			message: 'As condições ou benefícios informados para a promoção são inválidos.',
		})
	})

	test('InvalidPromotionTransitionError -> 400 INVALID_PROMOTION_TRANSITION', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidPromotionTransitionError('ARCHIVED', 'ACTIVE')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_PROMOTION_TRANSITION',
			message: 'Transição de status da promoção inválida.',
		})
	})

	test('InvalidHomeOfferSelectionError -> 400 INVALID_HOME_OFFER_SELECTION', () => {
		const thrown = captureThrow(() =>
			throwTranslatedDomainError(new InvalidHomeOfferSelectionError('not eligible')),
		)

		expect(thrown).toBeInstanceOf(BadRequestException)
		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'INVALID_HOME_OFFER_SELECTION',
			message:
				'As ofertas da home devem referenciar promoções públicas desta loja elegíveis para exibição na vitrine.',
		})
	})

	test('rethrows unchanged when the error class is not in the status map (plain Error)', () => {
		const original = new Error('unrelated failure')

		expect(() => throwTranslatedDomainError(original)).toThrow(original)
	})

	test('rethrows unchanged when the error class is not yet in the map', () => {
		const original = new NotAllowedError()

		expect(() => throwTranslatedDomainError(original)).toThrow(original)
	})
})
