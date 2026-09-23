-- Session-scoped helpers for the generator (pg_temp: they vanish with the session, so
-- nothing is left in the benchmark schema). Parameters arrive as custom settings
-- (bench.seed, bench.payments, bench.wallets, bench.merchants) set by the runner.

-- Deterministic pseudo-random number in [0, 1) for a key, derived from the seed.
-- A pure function of (seed, key): it does not depend on evaluation order, parallelism
-- or the global random() state, so a run is exactly reproducible.
CREATE OR REPLACE FUNCTION pg_temp.bench_u(k text) RETURNS float8
LANGUAGE sql STABLE AS $$
  SELECT (hashtextextended(current_setting('bench.seed') || ':' || k, 0) & 4503599627370495)::float8
         / 4503599627370496.0
$$;

-- Deterministic UUID for an entity, so ids are stable across runs of one seed.
CREATE OR REPLACE FUNCTION pg_temp.bench_uuid(kind text, k text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT md5(current_setting('bench.seed') || ':' || kind || ':' || k)::uuid
$$;

-- Number of "hot" Wallets: the top 1% (at least two, so a hot Wallet can pay another one).
CREATE OR REPLACE FUNCTION pg_temp.bench_hot() RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT greatest(2, ceil(current_setting('bench.wallets')::numeric * 0.01))::int
$$;

-- Wallet number for an endpoint of a Payment. Half of the endpoints land on the hot
-- Wallets (numbers 0 .. hot-1), half on the cold ones, uniformly inside each class.
CREATE OR REPLACE FUNCTION pg_temp.bench_wallet_no(k text) RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN pg_temp.bench_u(k || ':class') < 0.5
      THEN floor(pg_temp.bench_u(k || ':pick') * pg_temp.bench_hot())::int
    ELSE pg_temp.bench_hot()
         + floor(pg_temp.bench_u(k || ':pick') * (current_setting('bench.wallets')::int - pg_temp.bench_hot()))::int
  END
$$;

-- Wallet number of the next Wallet inside the same hot/cold class; used when a Payment
-- would otherwise pay its own source, so the class shares stay exactly as generated.
CREATE OR REPLACE FUNCTION pg_temp.bench_next_in_class(n int) RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN n < pg_temp.bench_hot() THEN (n + 1) % pg_temp.bench_hot()
    ELSE pg_temp.bench_hot()
         + (n - pg_temp.bench_hot() + 1) % (current_setting('bench.wallets')::int - pg_temp.bench_hot())
  END
$$;
