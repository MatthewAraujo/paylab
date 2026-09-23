# Index `ledger_entries.ledger_transaction_id` so the commit-time integrity trigger stays cheap

Status: accepted (T13; adopted in migration `20260923160000_read_and_settlement_indexes`)

**Problem.** The deferred trigger of ADR 0003 reads all entries of a Ledger Transaction by
`ledger_transaction_id` and runs three times per Settlement commit (once for the transaction row, once per
entry). Foreign keys carry no index in PostgreSQL and the schema had none, so every call scanned the whole
`ledger_entries` table. The scan happens inside the Settlement transaction, while the source Wallet lock of
ADR 0002 is held.

**Measurement** ([results](../experiments/T13-results.md), section 3). COMMIT latency of a Settlement-shaped
transaction, same generator at four sizes: 22 ms at 192 k entries, 58 ms at 477 k, 117 ms at 952 k, about
225 ms at 1.9 M (272 ms with `synchronous_commit=on`): linear in the ledger. With the index: 0.13 to 0.16 ms
at every size. Hot-Wallet throughput went from 3.5 to about 95 Settlements per second together with ADR 0006.

**Alternatives.** (a) Keep the full scan: rejected, the cost grows without bound. (b) Make the trigger cheaper
by checking only once per transaction (for example a trigger on `ledger_transactions` alone): rejected, it would
weaken the guarantee that the entries of every transaction are checked whichever row is inserted last (ADR 0003).
(c) Covering `(ledger_transaction_id) INCLUDE (direction, amount)`: not measured; the lookup returns two rows, so
the heap fetches cost almost nothing and the index would be larger for no visible gain.

**Choice.** A plain B-tree index `ledger_entries_ledger_transaction_id_idx (ledger_transaction_id)`, 45 MB at 1.9 M entries.

**Guarantee.** ADR 0003 is unchanged: the same trigger runs on the same events with the same result. Only its
lookup uses an index. A plan-regression test (`test/integration/index-plans.spec.ts`) fails if the lookup stops
using it.

**Cost.** About 45 MB per 1.9 M entries and one extra index insertion per entry: entry insert latency rose from
about 0.19 to 0.23 ms together with ADR 0006's index, and total insert throughput stayed within run-to-run noise
(section 5).
