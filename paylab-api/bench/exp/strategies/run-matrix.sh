#!/usr/bin/env bash
# EXPERIMENT ONLY (T14). Full measurement matrix: for every (shape, clients, repetition) block the benchmark
# database is restored from the `adopted` template, then the five strategies run in a rotated order.
# v2 (after the v1 run showed rotation aliasing and bimodal fsync latency, see docs/experiments/T14-results.md):
# Latin-square rotation (the first strategy of a cell differs in every repetition) and both commit modes.
# Usage: run-matrix.sh OUT.jsonl     (about 75 minutes; run on an otherwise idle machine)
set -euo pipefail
cd "$(dirname "$0")/../../.."
OUT="${1:?output file}"
ALL=(nokey forupdate serializable optimistic advisory)
ALLN=${#ALL[@]}
run_block() { # shape clients rep sync cellIndex
  local order=() i
  for i in 0 1 2 3 4; do order+=("${ALL[$(( (i + $5 + $3) % ALLN ))]}"); done
  bench/exp/reset.sh adopted >/dev/null
  npx ts-node -r tsconfig-paths/register bench/exp/strategies/load.ts \
    --shape "$1" --clients "$2" --rep "$3" --sync "$4" --duration 10 --strategies "$(IFS=,; echo "${order[*]}")" >> "$OUT"
}
CELLS=("H 4" "H 16" "H 64" "W 16" "W 64" "M 4" "M 16" "M 64")
for rep in 1 2 3; do
  idx=0
  for sync in off on; do
    for cell in "${CELLS[@]}"; do
      set -- $cell
      run_block "$1" "$2" "$rep" "$sync" "$idx"
      idx=$((idx + 1))
    done
  done
done
echo done >> "$OUT.done"
