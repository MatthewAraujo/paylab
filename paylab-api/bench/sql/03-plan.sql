-- The Payment plan: one row per requested Payment (Wallet to Wallet transfer), a pure
-- function of the seed. Time runs over 90 days from 2026-06-01 UTC; two consecutive
-- Payments share a timestamp so the keyset tie-break on id is exercised. Statuses are
-- assigned by the generator (not by replaying Settlement): 95% SUCCEEDED, 3% FAILED,
-- 1.5% PROCESSING, 0.5% CREATED.
CREATE TABLE bench_plan AS
WITH endpoints AS (
  SELECT i,
         pg_temp.bench_wallet_no('p:' || i || ':src') AS src_no,
         pg_temp.bench_wallet_no('p:' || i || ':dst') AS raw_dst_no
  FROM generate_series(1, current_setting('bench.payments')::int) AS i
)
SELECT i,
       src_no,
       CASE WHEN raw_dst_no = src_no THEN pg_temp.bench_next_in_class(raw_dst_no) ELSE raw_dst_no END AS dst_no,
       (100 + floor(pg_temp.bench_u('p:' || i || ':amount') * 49900))::bigint AS amount,
       (CASE
          WHEN r < 0.03 THEN 'FAILED'
          WHEN r < 0.045 THEN 'PROCESSING'
          WHEN r < 0.05 THEN 'CREATED'
          ELSE 'SUCCEEDED'
        END)::payment_status AS status,
       date_trunc('milliseconds',
         timestamptz '2026-06-01 00:00:00+00'
         + make_interval(secs => ((i - 1) / 2) * (90 * 86400.0 / ceil(current_setting('bench.payments')::numeric / 2))::float8)
       ) AS created_at
FROM (SELECT e.*, pg_temp.bench_u('p:' || e.i || ':status') AS r FROM endpoints e) AS e;

ALTER TABLE bench_plan ADD PRIMARY KEY (i);
ANALYZE bench_plan;
