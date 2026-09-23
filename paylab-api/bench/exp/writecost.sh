#!/bin/sh
# Experiment helper: fresh scratch clone + variant DDL, warm-up, then 3 fixed-size runs of the insert
# workload and of the settlement workload (one client, synchronous_commit=off so that WAL fsync noise
# does not hide index maintenance; deferred triggers still run at COMMIT). Reports tps, WAL bytes per transaction
# (deterministic index-maintenance cost) and the latency of the entries insert and of COMMIT.
# Usage: writecost.sh LABEL 'DDL' [insert txns] [settle txns]
D="$(dirname "$0")"; NI="${3:-1500}"; NS="${4:-800}"
"$D/clone.sh" paylab_bench_w paylab_bench_baseline "$2" 2>&1 | grep -v NOTICE
echo "## $1"
Q() { PGDB=paylab_bench_w "$D/psql.sh" -At "$@"; }
Q -c "select 'indexes: '||coalesce(string_agg(indexrelname||' '||pg_size_pretty(pg_relation_size(indexrelid)), ', '),'-') from pg_stat_user_indexes where indexrelname like 'exp_%'"
for w in insert settle; do
  n=$NI; [ $w = settle ] && n=$NS
  "$D/pgb.sh" paylab_bench_w $w "-t 300" 1 >/dev/null
  Q -c CHECKPOINT >/dev/null
  for r in 1 2 3; do
    l0=$(Q -c "select pg_current_wal_lsn()")
    out=$(PGOPTIONS="-c synchronous_commit=off" "$D/pgb.sh" paylab_bench_w $w "-t $n" 1)
    wal=$(Q -c "select round((pg_current_wal_lsn() - '$l0'::pg_lsn) / $n)")
    echo "$w run $r: wal/txn=${wal}B; $(echo "$out" | grep -E 'tps|COMMIT|INSERT INTO ledger_entries|INSERT INTO payments|UPDATE payments|sum\(' | sed -E 's/\s+/ /g; s/\(.*\)//' | cut -c1-40 | tr '\n' ';')"
  done
done
