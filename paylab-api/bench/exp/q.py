#!/usr/bin/env python3
"""Experiment helper (T13/T14): time a query with EXPLAIN (ANALYZE, BUFFERS) through psql.

Usage: q.py [--db NAME] [--n 7] [--plan] 'SQL with literal values'
Runs once to warm the cache (discarded), then n times; prints median/min/max Execution Time
and, with --plan, the last plan. Experiment-only: never imported by the application.
"""
import argparse, re, statistics, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument("--db", default="paylab_bench")
ap.add_argument("--n", type=int, default=7)
ap.add_argument("--plan", action="store_true")
ap.add_argument("sql")
a = ap.parse_args()

def run(sql):
    p = subprocess.run(
        ["docker", "exec", "-i", "paylab-postgres-bench", "psql", "-U", "paylab", a.db, "-X", "-q", "-A", "-t"],
        input="SET plan_cache_mode=force_custom_plan;\nEXPLAIN (ANALYZE, BUFFERS) " + sql + ";\n",
        capture_output=True, text=True)
    if p.returncode or "ERROR" in p.stderr:
        sys.exit(p.stderr)
    return p.stdout

run(a.sql)
times, out = [], ""
for _ in range(a.n):
    out = run(a.sql)
    times.append(float(re.search(r"Execution Time: ([\d.]+) ms", out).group(1)))
print(f"median={statistics.median(times):.3f} ms  min={min(times):.3f}  max={max(times):.3f}  n={a.n}")
if a.plan:
    print(out)
