import { Account } from '@/domain/paylab/enterprise/entities/account'
import { InvalidAccountError } from '@/domain/paylab/enterprise/errors/invalid-account-error'
import { UnsupportedCurrencyError } from '@/domain/paylab/enterprise/errors/unsupported-currency-error'

describe('Account', () => {
	it('creates a Wallet owned by a Merchant', () => {
		const result = Account.create({ kind: 'WALLET', merchantId: 'merchant-1', currency: 'BRL' })

		expect(result.isRight()).toBe(true)
		const wallet = result.value as Account
		expect(wallet.isWallet()).toBe(true)
		expect(wallet.merchantId).toBe('merchant-1')
	})

	it('rejects a Wallet without a Merchant', () => {
		const result = Account.create({ kind: 'WALLET', currency: 'BRL' })

		expect(result.value).toBeInstanceOf(InvalidAccountError)
	})

	it('creates an External Clearing Account without a Merchant', () => {
		const result = Account.create({ kind: 'EXTERNAL_CLEARING', currency: 'BRL' })

		expect(result.isRight()).toBe(true)
		const clearing = result.value as Account
		expect(clearing.isWallet()).toBe(false)
		expect(clearing.merchantId).toBeUndefined()
	})

	it('rejects an External Clearing Account owned by a Merchant', () => {
		const result = Account.create({
			kind: 'EXTERNAL_CLEARING',
			merchantId: 'merchant-1',
			currency: 'BRL',
		})

		expect(result.value).toBeInstanceOf(InvalidAccountError)
	})

	it('accepts only BRL', () => {
		const result = Account.create({ kind: 'WALLET', merchantId: 'merchant-1', currency: 'USD' })

		expect(result.value).toBeInstanceOf(UnsupportedCurrencyError)
	})
})
