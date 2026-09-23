#!/bin/sh
# Experiment helper: put the benchmark database back in a known schema state from a template kept
# in the same PostgreSQL container. Usage: reset.sh [baseline|adopted]   (default adopted)
#   baseline: only the constraint-provided indexes (the state T12 loaded, before migration 20260923160000)
#   adopted:  after migration 20260923160000_read_and_settlement_indexes (ADRs 0005 to 0007)
# The templates are created once with:  CREATE DATABASE paylab_bench_<state> TEMPLATE paylab_bench;
set -e
D="$(dirname "$0")"
PGDB=postgres "$D/psql.sh" -q -c "DROP DATABASE IF EXISTS paylab_bench" -c "CREATE DATABASE paylab_bench TEMPLATE paylab_bench_${1:-adopted}"
PGDB=paylab_bench "$D/psql.sh" -q -c "VACUUM (ANALYZE)"
echo "paylab_bench reset to ${1:-adopted}"
