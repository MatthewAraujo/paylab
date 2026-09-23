-- One batch of transfers: plan rows with bench.lo < i <= bench.hi, inserted in one
-- database transaction (the runner opens it) so the deferred triggers see complete
-- Ledger Transactions at commit. SUCCEEDED Payments get a Ledger Transaction with one
-- debit on the source Wallet and one credit on the destination Wallet; the others get none.
INSERT INTO ledger_transactions (id, created_at)
SELECT pg_temp.bench_uuid('t', i::text), created_at
FROM bench_plan
WHERE i > current_setting('bench.lo')::int AND i <= current_setting('bench.hi')::int
  AND status = 'SUCCEEDED';

INSERT INTO ledger_entries (id, ledger_transaction_id, account_id, direction, amount, created_at)
SELECT pg_temp.bench_uuid('e', i || ':d'), pg_temp.bench_uuid('t', i::text),
       pg_temp.bench_uuid('w', src_no::text), 'DEBIT'::entry_direction, amount, created_at
FROM bench_plan
WHERE i > current_setting('bench.lo')::int AND i <= current_setting('bench.hi')::int
  AND status = 'SUCCEEDED'
UNION ALL
SELECT pg_temp.bench_uuid('e', i || ':c'), pg_temp.bench_uuid('t', i::text),
       pg_temp.bench_uuid('w', dst_no::text), 'CREDIT'::entry_direction, amount, created_at
FROM bench_plan
WHERE i > current_setting('bench.lo')::int AND i <= current_setting('bench.hi')::int
  AND status = 'SUCCEEDED';

INSERT INTO payments (id, merchant_id, source_account_id, destination_account_id, amount, currency,
                      status, failure_reason, idempotency_key, request_fingerprint,
                      ledger_transaction_id, created_at, updated_at)
SELECT pg_temp.bench_uuid('p', i::text),
       pg_temp.bench_uuid('m', (src_no % current_setting('bench.merchants')::int)::text),
       pg_temp.bench_uuid('w', src_no::text),
       pg_temp.bench_uuid('w', dst_no::text),
       amount, 'BRL', status,
       CASE WHEN status = 'FAILED' THEN 'INSUFFICIENT_FUNDS' END,
       'bench-' || i,
       encode(sha256(convert_to(i::text, 'UTF8')), 'hex'),
       CASE WHEN status = 'SUCCEEDED' THEN pg_temp.bench_uuid('t', i::text) END,
       created_at, created_at
FROM bench_plan
WHERE i > current_setting('bench.lo')::int AND i <= current_setting('bench.hi')::int;
