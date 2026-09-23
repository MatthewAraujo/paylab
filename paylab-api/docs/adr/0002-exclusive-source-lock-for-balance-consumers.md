# Exclusive pessimistic lock on the source Wallet, for balance consumers only

Status: accepted (September baseline; alternatives are planned benchmarks, not rejected)

A Settlement whose source is a Wallet takes `SELECT ... FOR NO KEY UPDATE` on that Wallet row, in `READ COMMITTED`, then computes the Balance from the ledger and posts the entries in the same transaction. Only balance consumers lock. A credit to the destination, and any Settlement sourced from an External Clearing Account, takes no lock and runs no funds check. Each Settlement locks a single row, so crossed transfers cannot deadlock.

`FOR NO KEY UPDATE` is chosen over `FOR UPDATE` because inserting a Ledger Entry takes a `FOR KEY SHARE` lock on the referenced Account through the foreign key. That lock conflicts with `FOR UPDATE` but not with `FOR NO KEY UPDATE`, so credits are not blocked behind an in-flight debit.

Considered options, kept as measured experiments over this baseline: `SERIALIZABLE` with retry, optimistic versioning on the Wallet, and advisory locks per Account.
