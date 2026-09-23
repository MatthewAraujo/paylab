#!/usr/bin/env python3
"""EXPERIMENT ONLY (T14). Median over repetitions of the JSONL from run-matrix.sh, as markdown tables.
Usage: summarize.py docs/experiments/raw/T14-load.jsonl"""
import json, statistics, sys, collections
rows = [json.loads(l) for l in open(sys.argv[1])]
cells = collections.defaultdict(list)
for r in rows:
    cells[(r["shape"], r["sync"], r["clients"], r["strategy"])].append(r)
order = ["nokey", "forupdate", "advisory", "optimistic", "serializable"]
def med(rs, k): return statistics.median(r[k] for r in rs)
def rng(rs, k): v = [r[k] for r in rs]; return f"{min(v):g}-{max(v):g}"
for shape in "HWM":
    for sync in ("on", "off"):
        cs = sorted({c for (s, y, c, _) in cells if s == shape and y == sync})
        if not cs: continue
        print(f"\n### shape {shape}, synchronous_commit={sync}\n")
        extra = "credit tps | credit p50 / p99 (ms) | " if shape == "M" else ""
        print(f"| clients | strategy | tps (median, range) | p50 / p95 / p99 ms | {extra}attempts/success | ser. fail | ver. conflicts | deadlocks | exhausted | acquire mean / p95 ms | avg lock waiters |")
        print("| ---: | --- |" + " ---: |" * (10 if shape == "M" else 8))
        for c in cs:
            for st in order:
                rs = cells.get((shape, sync, c, st))
                if not rs: continue
                e = f"{med(rs,'creditTps'):g} | {med(rs,'creditP50'):g} / {med(rs,'creditP99'):g} | " if shape == "M" else ""
                lat = "debit " if shape == "M" else ""
                pl = f"{med(rs,'debitP50'):g} / {med(rs,'debitP95'):g} / {med(rs,'debitP99'):g}" if shape == "M" else f"{med(rs,'p50'):g} / {med(rs,'p95'):g} / {med(rs,'p99'):g}"
                tps = med(rs, 'debitTps') if shape == "M" else med(rs, 'tps')
                tpsr = rng(rs, 'debitTps') if shape == "M" else rng(rs, 'tps')
                print(f"| {c} | {st} | {tps:g} ({tpsr}) | {pl} | {e}{med(rs,'attemptsPerSuccess'):g} | {med(rs,'serializationFailures'):g} | {med(rs,'versionConflicts'):g} | {med(rs,'deadlocks'):g} | {med(rs,'exhausted'):g} | {med(rs,'acquireMeanMs'):g} / {med(rs,'acquireP95Ms'):g} | {med(rs,'avgLockWaiters'):g} |")
