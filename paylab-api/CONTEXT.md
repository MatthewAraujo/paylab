# PayLab

A fictional payment processing platform. Fictional companies use an API to create payments and transfers between accounts, and the platform records every money movement in a double-entry ledger.

## Language

### Accounts

**Merchant**:
A fictional company that uses the PayLab API and owns one or more Wallets.
_Avoid_: Customer, client, store, tenant

**Account**:
A logical container of balance that appears on ledger entries. Every Account is either a Wallet or an External Clearing Account.
_Avoid_: Balance holder, bank account

**Wallet**:
An Account owned by a Merchant that holds that Merchant's funds inside PayLab.
_Avoid_: Merchant account, customer account

**External Clearing Account**:
A platform-owned Account that stands for the world outside PayLab (provider, bank). It is the counterpart of every movement of funds into or out of the platform, so the sum of all ledger entries is always zero.
_Avoid_: Settlement account, bank account, suspense account

### Payments and ledger

**Payment**:
A request to move an amount between two Accounts, together with its lifecycle state. It is the intent; the ledger is the fact.
_Avoid_: Transaction, charge, transfer

**Ledger Transaction**:
The accounting record of one consummated financial event, made of two or more Ledger Entries that balance to zero. It is created only when the event has actually happened.
_Avoid_: Transaction (alone), journal, posting

**Ledger Entry**:
One debit or credit line of a Ledger Transaction against a single Account. Entries are never edited or deleted; a correction is always a new compensating Ledger Transaction.
_Avoid_: Movement, line item, record

**Settlement**:
The single atomic step where a Payment's Ledger Transaction is written and the Payment becomes `SUCCEEDED`. Funds sufficiency is decided at this moment, not earlier.
_Avoid_: Capture, posting, completion

**Balance**:
The net sum of an Account's Ledger Entries, credits minus debits. It is derived from the ledger, never stored as an independent value.
_Avoid_: Funds, available amount, stored balance

**Balance Consumer**:
A Payment whose source is a Wallet, and therefore the only kind of Payment that must prove sufficient funds at Settlement. A Payment sourced from an External Clearing Account is not one.
_Avoid_: Debit payment, outgoing payment

**Idempotency Key**:
A client-chosen value, unique per Merchant, that identifies one intended Payment so that repeating the same request never creates a second Payment.
_Avoid_: Request id, dedup token

**Amount**:
A monetary value in the smallest unit of its currency (centavos for BRL), stored as an integer and never as a floating-point number. Each Account and Payment carries a currency; September operates in BRL only.
_Avoid_: Value, price, decimal money

## Performance facts (T13)

Measured on the benchmark dataset; details and rejected alternatives are in the ADRs, not here.

- Commit cost of a Settlement depends on an index the schema does not get from constraints: the deferred integrity trigger looks up entries by `ledger_transaction_id`. Without it the commit scans the whole ledger (linear, ~225 ms at 1.9 M entries) while the source Wallet lock is held (ADR 0005).
- The Balance of a Wallet is an index-only scan whose cost grows linearly with that Wallet's entries (~0.11 ms per thousand). It is also the lock hold time, so it caps how fast one Wallet can be debited (ADRs 0006, 0009).
- History and the Payment list are keyset-only; offset was measured and turns into a cliff on deep pages (ADR 0008). Listing by `accountId` for a small Merchant can hit a planner misestimate (22 ms instead of ~2 ms), left as a follow-up (ADR 0007).
