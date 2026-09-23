#!/bin/sh
# Experiment helper: apply an index (or several statements), vacuum, then run the suite for the given query-name filters.
# Usage: variant.sh LABEL 'SQL;SQL' filter...   (DROP is the caller's job)
l="$1"; c="$2"; shift 2
P="$(dirname "$0")/psql.sh"
echo "-- $l: $c"
$P -q -c "$c" -c "VACUUM (ANALYZE) ledger_entries" -c "VACUUM (ANALYZE) payments"
$P -At -c "select indexrelname||' '||pg_size_pretty(pg_relation_size(indexrelid)) from pg_stat_user_indexes where indexrelname like 'exp_%'"
for o in "$@"; do "$(dirname "$0")/suite.py" "$l" --only "$o" | tail -n +5; done
