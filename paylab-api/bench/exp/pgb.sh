#!/bin/sh
# Experiment helper: pgbench a workload file on scratch DB $1.
# Usage: pgb.sh DB WORKLOAD "-T 30" clients     (or "-t 1500" for a fixed transaction count)
D="$(dirname "$0")"
docker exec -i paylab-postgres-bench sh -c "cat > /tmp/w.pgbench" < "$D/$2.pgbench"
docker exec -e PGOPTIONS="${PGOPTIONS}" paylab-postgres-bench pgbench -U paylab -n -r $3 -c "${4:-1}" -j "${4:-1}" -f /tmp/w.pgbench "$1" 2>&1 | grep -E "tps|latency average|COMMIT|FOR NO KEY|INSERT INTO ledger_entries|INSERT INTO payments|UPDATE payments|sum\(|failed|ERROR"
