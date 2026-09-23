-- Empties every application table of the benchmark database, keeping the External
-- Clearing Account created by the baseline migration. TRUNCATE is not covered by the
-- ledger triggers (see the header of the integrity migration); nothing else is bypassed.
DROP TABLE IF EXISTS bench_plan;
DROP INDEX IF EXISTS bench_load_entries_by_transaction;
TRUNCATE payments, ledger_entries, ledger_transactions, merchant_api_keys;
DELETE FROM accounts WHERE merchant_id IS NOT NULL;
DELETE FROM merchants;
