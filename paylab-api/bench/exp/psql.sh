#!/bin/sh
# Experiment helper: psql inside the benchmark container. DB via PGDB (default paylab_bench).
exec docker exec -i paylab-postgres-bench psql -U paylab "${PGDB:-paylab_bench}" -X "$@"
