# Enforce ledger integrity in the database, not only in the domain

Status: accepted

The ledger invariants are enforced by PostgreSQL itself, with the domain layer validating too. The database is the last line of defence against bugs, scripts and future migrations.

- A deferred constraint trigger checks at commit that the Ledger Entries of every Ledger Transaction sum to zero, and that no Ledger Transaction is empty (at least two entries).
- Foreign keys guarantee that every Ledger Entry points to an existing Ledger Transaction and Account.
- Triggers reject `UPDATE` and `DELETE` on the ledger tables. Entry amounts are constrained positive, with debit or credit carried in its own column.

"Immutable" means the history is never altered: any future correction, such as a refund or reversal, is a new compensating Ledger Transaction and never an edit. Refunds and reversals are out of September scope.

Prisma cannot model triggers or deferred constraints, so they live in hand-written SQL migrations.
