# One covering index on `payments (merchant_id, created_at DESC, id DESC) INCLUDE (status, amount)`; no partial index

Status: accepted (T13; adopted in migration `20260923160000_read_and_settlement_indexes`)

**Problem.** The Payment list (keyset, optional filters by Account, status and period) and the daily report both
filter `payments` by `merchant_id`. Without a suitable index the planner used a bitmap scan of the unique
`(merchant_id, idempotency_key)` index and then sorted all rows of the Merchant.

**Measurement** ([results](../experiments/T13-results.md), sections 1 and 4). Baseline lists 25 ms (cold Merchant,
9.9 k Payments) to 52 ms (hot Merchant, 60 k Payments). Composite `(merchant_id, created_at DESC, id DESC)`: first
and deep pages 0.1 to 0.3 ms, period filter 0.13 ms, account filter 0.11 ms (hot Merchant), rare status 5 ms hot and
15 ms cold (residual filter scanning the index in order). With a plain composite the 90-day report for the hot
Merchant got *worse* than baseline (184 versus 137 ms in that session: 60 k random heap fetches). With `INCLUDE
(status, amount)` the report is an Index Only Scan: 15 ms for 30 days and 32 ms for 90 days (hot), 2.8 and 8.3 ms
(cold), against 60 and 90 ms and 25 and 30 ms at baseline. A partial index `WHERE status <> 'SUCCEEDED'` (2.9 MB)
cut rare-status lists from 15 to 2 ms.

**Alternatives.** Plain composite: rejected (slower report on large ranges). `(merchant_id, status, created_at, id)`:
not built; it would order by status first and break the keyset order for unfiltered pages. Partial open-status
index: measured and **rejected for now**: the composite already bounds the worst measured list at 15 ms, the cost
of that case grows with a Merchant's Payments and not with the ledger, and the index adds a predicate that
every future status change must keep implication-compatible. Revisit if lists filtered by a rare status exceed
an agreed latency for large Merchants.

**Choice.** `payments_merchant_created_id_idx (merchant_id, created_at DESC, id DESC) INCLUDE (status, amount)`,
74 MB at 1.0 M Payments.

**Guarantee.** Result sets and query text are unchanged. Status updates were already non-HOT (the unique
`ledger_transaction_id` is set at Settlement), so carrying `status` adds no HOT loss. A plan-regression test
asserts the Payment list and the report use the index.

**Cost.** 74 MB and one index insertion per Payment insert and per non-HOT update (insert throughput within noise
of the alternatives, section 5). The account filter (`source OR destination`) cannot use the composite as a
condition; for a cold Merchant the planner misestimates it (9 rows expected, 537 actual) and takes a 22 ms bitmap
plan instead of a 1.6 ms ordered scan. That is a statistics limit left as a follow-up, not a reason to add an index.
