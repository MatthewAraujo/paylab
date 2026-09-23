-- One funding Payment per Wallet (External Clearing Account to Wallet), created before
-- every transfer and sized to cover the Wallet's total outflow plus a buffer, so no Wallet
-- is ever overdrawn at any point in time. Balanced Ledger Transactions, ordinary inserts:
-- the deferred triggers check them at commit.
CREATE TEMP TABLE bench_funding ON COMMIT DROP AS
SELECT w.n,
       coalesce(o.outflow, 0) + 10000 + floor(pg_temp.bench_u('fund:' || w.n || ':buffer') * 90000)::bigint AS amount,
       timestamptz '2026-05-31 00:00:00+00' + make_interval(secs => w.n) AS created_at
FROM generate_series(0, current_setting('bench.wallets')::int - 1) AS w(n)
LEFT JOIN (
  SELECT src_no, sum(amount) AS outflow FROM bench_plan WHERE status = 'SUCCEEDED' GROUP BY src_no
) AS o ON o.src_no = w.n;

INSERT INTO ledger_transactions (id, created_at)
SELECT pg_temp.bench_uuid('t', 'fund:' || n), created_at FROM bench_funding;

INSERT INTO ledger_entries (id, ledger_transaction_id, account_id, direction, amount, created_at)
SELECT pg_temp.bench_uuid('e', 'fund:' || n || ':d'),
       pg_temp.bench_uuid('t', 'fund:' || n),
       (SELECT id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'),
       'DEBIT'::entry_direction, amount, created_at
FROM bench_funding
UNION ALL
SELECT pg_temp.bench_uuid('e', 'fund:' || n || ':c'),
       pg_temp.bench_uuid('t', 'fund:' || n),
       pg_temp.bench_uuid('w', n::text),
       'CREDIT'::entry_direction, amount, created_at
FROM bench_funding;

INSERT INTO payments (id, merchant_id, source_account_id, destination_account_id, amount, currency,
                      status, idempotency_key, request_fingerprint, ledger_transaction_id, created_at, updated_at)
SELECT pg_temp.bench_uuid('p', 'fund:' || n),
       pg_temp.bench_uuid('m', (n % current_setting('bench.merchants')::int)::text),
       (SELECT id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'),
       pg_temp.bench_uuid('w', n::text),
       amount, 'BRL', 'SUCCEEDED',
       'bench-fund-' || n,
       encode(sha256(convert_to('fund:' || n, 'UTF8')), 'hex'),
       pg_temp.bench_uuid('t', 'fund:' || n),
       created_at, created_at
FROM bench_funding;
