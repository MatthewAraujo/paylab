-- Indexes adopted by the T13 experiments (ADR 0005, ADR 0006). Hand-written SQL: Prisma
-- cannot model INCLUDE columns, so migrations stay the source of truth for these.
-- Measurements and rejected alternatives: docs/experiments/T13-results.md.

-- Commit-time integrity trigger (ADR 0003). ledger_assert_transaction_balanced looks up
-- the entries of a Ledger Transaction three times per Settlement (once for the transaction row,
-- once per entry), and nothing indexed that lookup: each call scanned the whole table, so a
-- commit cost about 0.12 ms per thousand entries per call and grew with the ledger. It also
-- runs while the source Wallet lock (ADR 0002) is held.
CREATE INDEX "ledger_entries_ledger_transaction_id_idx"
  ON "ledger_entries" ("ledger_transaction_id");

-- Ledger Entry history (keyset order) and Balance, per Account. The key order is equality,
-- then the keyset sort (created_at DESC, id DESC), so every history page is an ordered index
-- scan that stops at LIMIT. INCLUDE (direction, amount) lets the Balance aggregate run as an
-- index-only scan; the Balance is computed while the source Wallet lock is held, so its
-- latency is the lock hold time.
CREATE INDEX "ledger_entries_account_created_id_idx"
  ON "ledger_entries" ("account_id", "created_at" DESC, "id" DESC)
  INCLUDE ("direction", "amount");

-- Payment list (keyset order, optional filters as residual conditions) and daily report, per
-- Merchant. INCLUDE (status, amount) makes the report an index-only scan.
CREATE INDEX "payments_merchant_created_id_idx"
  ON "payments" ("merchant_id", "created_at" DESC, "id" DESC)
  INCLUDE ("status", "amount");
