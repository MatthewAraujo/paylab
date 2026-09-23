#!/bin/sh
# Experiment helper: recreate scratch database $1 as a copy of $2 (default paylab_bench_baseline),
# add the Wallet-rank helper table used by the pgbench scripts, and apply optional DDL ($3).
set -e
D="$(dirname "$0")"
PGDB=postgres "$D/psql.sh" -q -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1 TEMPLATE ${2:-paylab_bench_baseline}"
PGDB=$1 "$D/psql.sh" -q -c "CREATE TABLE bw AS SELECT row_number() OVER (ORDER BY count(*) DESC, a.id) AS n, a.id, a.merchant_id FROM accounts a JOIN ledger_entries e ON e.account_id = a.id WHERE a.kind = 'WALLET' GROUP BY a.id, a.merchant_id" -c "ALTER TABLE bw ADD PRIMARY KEY (n)"
[ -n "$3" ] && PGDB=$1 "$D/psql.sh" -q -c "$3"
PGDB=$1 "$D/psql.sh" -q -c "VACUUM (ANALYZE)"
