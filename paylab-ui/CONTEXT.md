# PayLab UI Domain Language

## Product surface

**Operational Console**:
The internal web interface used to observe and operate PayLab. It exposes backend behavior without becoming a separate source of financial truth.
_Avoid_: Customer portal, banking app, admin CRUD

**Capability Availability**:
Whether a backend capability is present in the generated OpenAPI contract and can be used by the Operational Console. An unavailable capability is shown honestly; it is never replaced by invented production data.
_Avoid_: Mock mode, fake fallback

## Access model

**Operational Console access**:
The console has no login and is read-only. It reads one Merchant's data through a Merchant API key held in a server-only environment variable, so the browser never sees a credential. Creating Wallets or Payments is done through the API, not the console.
_Avoid_: User login, customer session, admin CRUD

## Accounts

**Merchant**:
A fictional company that uses the PayLab API and owns one or more Wallets.
_Avoid_: Customer, client, store, tenant

**Account**:
A logical container of Balance that appears on Ledger Entries. Every Account is either a Wallet or an External Clearing Account.
_Avoid_: Balance holder, bank account

**Wallet**:
An Account owned by a Merchant that holds that Merchant's funds inside PayLab.
_Avoid_: Merchant account, customer account

**External Clearing Account**:
A platform-owned Account representing the world outside PayLab. It is the counterpart of movements into or out of the platform.
_Avoid_: Settlement account, bank account, suspense account

## Payments and ledger

**Payment**:
A request to move an Amount between two Accounts together with its lifecycle state. It is the intent; the ledger is the fact.
_Avoid_: Transaction, charge, transfer

**Ledger Transaction**:
The accounting record of one consummated financial event, made of two or more Ledger Entries that balance to zero.
_Avoid_: Transaction (alone), journal, posting

**Ledger Entry**:
One immutable debit or credit line of a Ledger Transaction against an Account.
_Avoid_: Movement, line item, record

**Settlement**:
The atomic step in which a Payment's Ledger Transaction is written and the Payment becomes `SUCCEEDED`. Funds sufficiency is decided at this moment.
_Avoid_: Capture, posting, completion

**Balance**:
The net sum of an Account's Ledger Entries, credits minus debits. It is derived from the ledger and is not independently stored.
_Avoid_: Funds, available amount, stored balance

**Amount**:
A positive monetary value in the smallest unit of its currency. September supports BRL centavos represented as integers.
_Avoid_: Value, price, floating-point money

**Idempotency Key**:
A Merchant-scoped client value identifying one intended Payment so that retrying the same request cannot create a second Payment.
_Avoid_: Request id, dedup token
