-- Merchants and Wallets. Wallet n belongs to Merchant n % merchants.
INSERT INTO merchants (id, name, created_at)
SELECT pg_temp.bench_uuid('m', n::text),
       'Benchmark Merchant ' || lpad(n::text, 3, '0'),
       timestamptz '2026-05-01 00:00:00+00'
FROM generate_series(0, current_setting('bench.merchants')::int - 1) AS n;

INSERT INTO accounts (id, kind, merchant_id, currency, created_at)
SELECT pg_temp.bench_uuid('w', n::text),
       'WALLET',
       pg_temp.bench_uuid('m', (n % current_setting('bench.merchants')::int)::text),
       'BRL',
       timestamptz '2026-05-01 00:00:00+00'
FROM generate_series(0, current_setting('bench.wallets')::int - 1) AS n;

-- Load-time helper index, dropped again by 05-finish.sql. The deferred balance trigger
-- (ADR 0003) looks entries up by ledger_transaction_id once per inserted row, and the
-- schema has no index for that lookup: without this one the load would scan the whole
-- entries table per row. It weakens nothing; it only speeds the trigger up during the
-- load. It is not part of the dataset, so plan experiments start from the schema's own indexes.
CREATE INDEX bench_load_entries_by_transaction ON ledger_entries (ledger_transaction_id);
