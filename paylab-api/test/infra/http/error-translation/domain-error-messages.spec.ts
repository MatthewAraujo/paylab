import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { BarcodeNotInDraftError } from '@/domain/quintalpet/application/use-cases/errors/barcode-not-in-draft-error'
import { EmptySaleDraftError } from '@/domain/quintalpet/application/use-cases/errors/empty-sale-draft-error'
import { FavoriteProductNotAvailableError } from '@/domain/quintalpet/application/use-cases/errors/favorite-product-not-available-error'
import { InvalidAttachmentTypeError } from '@/domain/quintalpet/application/use-cases/errors/invalid-attachment-type-error'
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
import { InvalidStoreCustomerTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-store-customer-transition-error'
import { InvalidVariantPricingError } from '@/domain/quintalpet/enterprise/errors/invalid-variant-pricing-error'
import { MerchandisingLimitExceededError } from '@/domain/quintalpet/enterprise/errors/merchandising-limit-exceeded-error'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { SaleDraftItemNotFoundError } from '@/domain/quintalpet/enterprise/errors/sale-draft-item-not-found-error'
import { SaleDraftNotEmptyError } from '@/domain/quintalpet/enterprise/errors/sale-draft-not-empty-error'
import { StalePdvSessionRequiresConfirmationError } from '@/domain/quintalpet/enterprise/errors/stale-pdv-session-requires-confirmation-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'
import { translateDomainError } from '@/infra/http/error-translation/domain-error-messages'

describe('translateDomainError', () => {
	test('NegativeInventoryBalanceError', () => {
		expect(translateDomainError(new NegativeInventoryBalanceError())).toEqual({
			code: 'INVENTORY_BALANCE_NEGATIVE',
			message: 'Não há estoque suficiente para atender esta movimentação.',
		})
	})

	test('MerchandisingLimitExceededError (product)', () => {
		expect(translateDomainError(new MerchandisingLimitExceededError('product', 8))).toEqual({
			code: 'MERCHANDISING_LIMIT_EXCEEDED',
			message: 'Você já atingiu o limite de 8 produtos em destaque.',
		})
	})

	test('NotAllowedError', () => {
		expect(translateDomainError(new NotAllowedError())).toEqual({
			code: 'NOT_ALLOWED',
			message: 'Você não tem permissão para realizar esta ação.',
		})
	})

	test('ResourceNotFoundError', () => {
		expect(translateDomainError(new ResourceNotFoundError())).toEqual({
			code: 'RESOURCE_NOT_FOUND',
			message: 'O recurso solicitado não foi encontrado.',
		})
	})

	test('BarcodeNotInDraftError does not leak the barcode', () => {
		const result = translateDomainError(new BarcodeNotInDraftError('7891234567890'))

		expect(result).toEqual({
			code: 'BARCODE_NOT_IN_DRAFT',
			message: 'Este código de barras não corresponde a nenhum item pendente nesta venda.',
		})
		expect(result?.message).not.toContain('7891234567890')
	})

	test('EmptySaleDraftError', () => {
		expect(translateDomainError(new EmptySaleDraftError())).toEqual({
			code: 'EMPTY_SALE_DRAFT',
			message: 'Não é possível finalizar uma venda sem itens.',
		})
	})

	test('FavoriteProductNotAvailableError', () => {
		expect(translateDomainError(new FavoriteProductNotAvailableError('racao-premium'))).toEqual({
			code: 'FAVORITE_PRODUCT_NOT_AVAILABLE',
			message: 'O produto "racao-premium" não está disponível para favoritar nesta loja.',
		})
	})

	test('InvalidAttachmentTypeError', () => {
		expect(translateDomainError(new InvalidAttachmentTypeError('application/exe'))).toEqual({
			code: 'INVALID_ATTACHMENT_TYPE',
			message: 'O tipo de arquivo enviado não é suportado.',
		})
	})

	test('OrderItemUnavailableError does not leak the variant id', () => {
		const result = translateDomainError(
			new OrderItemUnavailableError('11111111-1111-1111-1111-111111111111'),
		)

		expect(result).toEqual({
			code: 'ORDER_ITEM_UNAVAILABLE',
			message: 'Não há quantidade suficiente em estoque para um dos itens do pedido.',
		})
		expect(result?.message).not.toContain('11111111-1111-1111-1111-111111111111')
	})

	test('OrderPlacementConflictError', () => {
		expect(translateDomainError(new OrderPlacementConflictError())).toEqual({
			code: 'ORDER_PLACEMENT_CONFLICT',
			message: 'Não foi possível confirmar o estoque para este pedido. Tente novamente.',
		})
	})

	test('SaleDraftAlreadyActiveError', () => {
		expect(translateDomainError(new SaleDraftAlreadyActiveError())).toEqual({
			code: 'SALE_DRAFT_ALREADY_ACTIVE',
			message: 'Esta sessão de PDV já possui uma venda em andamento.',
		})
	})

	test('StoreCustomerConflictError', () => {
		expect(
			translateDomainError(
				new StoreCustomerConflictError(
					'A store customer already exists for this store and customer profile.',
				),
			),
		).toEqual({
			code: 'STORE_CUSTOMER_CONFLICT',
			message: 'Já existe um cliente cadastrado para esta loja com esses dados.',
		})
	})

	test('VariantBarcodeAlreadySetError does not leak the variant id', () => {
		const result = translateDomainError(
			new VariantBarcodeAlreadySetError('22222222-2222-2222-2222-222222222222'),
		)

		expect(result).toEqual({
			code: 'VARIANT_BARCODE_ALREADY_SET',
			message: 'Este código de barras já está vinculado a outro produto.',
		})
		expect(result?.message).not.toContain('22222222-2222-2222-2222-222222222222')
	})

	test('VariantNotFoundError does not leak the variant id', () => {
		const result = translateDomainError(
			new VariantNotFoundError('33333333-3333-3333-3333-333333333333'),
		)

		expect(result).toEqual({
			code: 'VARIANT_NOT_FOUND',
			message: 'Produto ou variante não encontrado ou não está mais ativo.',
		})
		expect(result?.message).not.toContain('33333333-3333-3333-3333-333333333333')
	})

	test('InvalidPostalCodeError', () => {
		expect(translateDomainError(new InvalidPostalCodeError())).toEqual({
			code: 'INVALID_POSTAL_CODE',
			message: 'CEP inválido ou não encontrado.',
		})
	})

	test('ArchivedCatalogEntityError', () => {
		expect(translateDomainError(new ArchivedCatalogEntityError())).toEqual({
			code: 'ARCHIVED_CATALOG_ENTITY',
			message: 'Itens arquivados do catálogo não podem ser editados.',
		})
	})

	test('CategoryCycleError', () => {
		expect(translateDomainError(new CategoryCycleError())).toEqual({
			code: 'CATEGORY_CYCLE',
			message: 'Não é possível criar um ciclo entre categorias.',
		})
	})

	test('DuplicateMerchandisingReferenceError (category)', () => {
		expect(translateDomainError(new DuplicateMerchandisingReferenceError('category'))).toEqual({
			code: 'DUPLICATE_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque não podem se repetir.',
		})
	})

	test('DuplicateMerchandisingReferenceError (product)', () => {
		expect(translateDomainError(new DuplicateMerchandisingReferenceError('product'))).toEqual({
			code: 'DUPLICATE_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque não podem se repetir.',
		})
	})

	test('InactiveCategoryAssignmentError', () => {
		expect(translateDomainError(new InactiveCategoryAssignmentError())).toEqual({
			code: 'INACTIVE_CATEGORY_ASSIGNMENT',
			message: 'Categorias inativas ou arquivadas não podem ser atribuídas a produtos.',
		})
	})

	test('InvalidCatalogLifecycleTransitionError', () => {
		expect(translateDomainError(new InvalidCatalogLifecycleTransitionError())).toEqual({
			code: 'INVALID_CATALOG_LIFECYCLE_TRANSITION',
			message: 'Transição de status do catálogo inválida.',
		})
	})

	test('InvalidDeliveryOptionError', () => {
		expect(translateDomainError(new InvalidDeliveryOptionError())).toEqual({
			code: 'INVALID_DELIVERY_OPTION',
			message: 'Opção de entrega desconhecida.',
		})
	})

	test('InvalidInventoryQuantityError', () => {
		expect(translateDomainError(new InvalidInventoryQuantityError())).toEqual({
			code: 'INVALID_INVENTORY_QUANTITY',
			message: 'Movimentações de estoque exigem uma quantidade positiva e diferente de zero.',
		})
	})

	test('InvalidMerchandisingReferenceError (category)', () => {
		expect(translateDomainError(new InvalidMerchandisingReferenceError('category'))).toEqual({
			code: 'INVALID_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque devem pertencer à loja atual.',
		})
	})

	test('InvalidMerchandisingReferenceError (product)', () => {
		expect(translateDomainError(new InvalidMerchandisingReferenceError('product'))).toEqual({
			code: 'INVALID_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque devem pertencer à loja atual.',
		})
	})

	test('InvalidOrderCustomerIdentityError', () => {
		expect(translateDomainError(new InvalidOrderCustomerIdentityError())).toEqual({
			code: 'INVALID_ORDER_CUSTOMER_IDENTITY',
			message:
				'Um pedido deve ter um cliente cadastrado ou um nome e telefone de convidado, mas não ambos.',
		})
	})

	test('InvalidOrderTransitionError', () => {
		expect(translateDomainError(new InvalidOrderTransitionError())).toEqual({
			code: 'INVALID_ORDER_TRANSITION',
			message: 'Transição de status do pedido inválida.',
		})
	})

	test('InvalidPrimaryCategoryError', () => {
		expect(translateDomainError(new InvalidPrimaryCategoryError())).toEqual({
			code: 'INVALID_PRIMARY_CATEGORY',
			message: 'A categoria principal deve estar entre as categorias atribuídas.',
		})
	})

	test('InvalidSaleDraftQuantityError', () => {
		expect(translateDomainError(new InvalidSaleDraftQuantityError())).toEqual({
			code: 'INVALID_SALE_DRAFT_QUANTITY',
			message: 'Não é possível reduzir um item da venda para uma quantidade abaixo de zero.',
		})
	})

	test('InvalidStoreCustomerTransitionError', () => {
		expect(translateDomainError(new InvalidStoreCustomerTransitionError())).toEqual({
			code: 'INVALID_STORE_CUSTOMER_TRANSITION',
			message: 'Transição de status do cliente inválida.',
		})
	})

	test('InvalidVariantPricingError', () => {
		expect(translateDomainError(new InvalidVariantPricingError())).toEqual({
			code: 'INVALID_VARIANT_PRICING',
			message: 'O preço da variante é inválido.',
		})
	})

	test('PdvSessionAlreadyOpenError', () => {
		expect(translateDomainError(new PdvSessionAlreadyOpenError())).toEqual({
			code: 'PDV_SESSION_ALREADY_OPEN',
			message: 'Já existe uma sessão de PDV aberta para esta loja hoje.',
		})
	})

	test('SaleDraftItemNotFoundError does not leak the variant id', () => {
		const result = translateDomainError(
			new SaleDraftItemNotFoundError('44444444-4444-4444-4444-444444444444'),
		)

		expect(result).toEqual({
			code: 'SALE_DRAFT_ITEM_NOT_FOUND',
			message: 'Não há nenhum item correspondente para este produto nesta venda.',
		})
		expect(result?.message).not.toContain('44444444-4444-4444-4444-444444444444')
	})

	test('SaleDraftNotEmptyError', () => {
		expect(translateDomainError(new SaleDraftNotEmptyError())).toEqual({
			code: 'SALE_DRAFT_NOT_EMPTY',
			message: 'Não é possível fechar uma sessão de PDV enquanto a venda ativa ainda tiver itens.',
		})
	})

	test('StalePdvSessionRequiresConfirmationError uses the stable cross-repo contract code', () => {
		expect(translateDomainError(new StalePdvSessionRequiresConfirmationError())).toEqual({
			code: 'PDV_STALE_SESSION',
			message:
				'Existe uma sessão de PDV aberta de um dia anterior. Confirme a substituição para abrir uma nova sessão.',
		})
	})

	test('StoreCustomerAddressNotFoundError', () => {
		expect(translateDomainError(new StoreCustomerAddressNotFoundError())).toEqual({
			code: 'STORE_CUSTOMER_ADDRESS_NOT_FOUND',
			message: 'Endereço do cliente não encontrado.',
		})
	})

	test('CatalogConflictError', () => {
		expect(
			translateDomainError(new CatalogConflictError('Product slug already exists in this store.')),
		).toEqual({
			code: 'CATALOG_CONFLICT',
			message:
				'Já existe um registro de catálogo com esses dados. Verifique as informações e tente novamente.',
		})
	})

	test('CatalogValidationError', () => {
		expect(
			translateDomainError(
				new CatalogValidationError('A primary category is required when categories are set.'),
			),
		).toEqual({
			code: 'CATALOG_VALIDATION_ERROR',
			message:
				'Os dados informados para o catálogo são inválidos. Verifique as informações e tente novamente.',
		})
	})

	test('InvalidPromotionError', () => {
		expect(translateDomainError(new InvalidPromotionError('name is required'))).toEqual({
			code: 'INVALID_PROMOTION',
			message: 'Os dados informados para a promoção são inválidos. Verifique e tente novamente.',
		})
	})

	test('InvalidPromotionPayloadError', () => {
		expect(translateDomainError(new InvalidPromotionPayloadError('bad benefit'))).toEqual({
			code: 'INVALID_PROMOTION_PAYLOAD',
			message: 'As condições ou benefícios informados para a promoção são inválidos.',
		})
	})

	test('InvalidPromotionTransitionError', () => {
		expect(translateDomainError(new InvalidPromotionTransitionError('ARCHIVED', 'ACTIVE'))).toEqual(
			{
				code: 'INVALID_PROMOTION_TRANSITION',
				message: 'Transição de status da promoção inválida.',
			},
		)
	})

	test('InvalidHomeOfferSelectionError', () => {
		expect(translateDomainError(new InvalidHomeOfferSelectionError('not eligible'))).toEqual({
			code: 'INVALID_HOME_OFFER_SELECTION',
			message:
				'As ofertas da home devem referenciar promoções públicas desta loja elegíveis para exibição na vitrine.',
		})
	})

	test('returns null for a non-mapped Error', () => {
		expect(translateDomainError(new Error('anything else'))).toBeNull()
	})

	test('returns null for non-Error input', () => {
		expect(translateDomainError(undefined)).toBeNull()
		expect(translateDomainError('some string')).toBeNull()
		expect(translateDomainError({ message: 'not an Error instance' })).toBeNull()
	})
})
