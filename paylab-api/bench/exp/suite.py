#!/usr/bin/env python3
"""Experiment helper (T13): run the documented read queries for hot/cold targets and print
median execution times as a markdown row set. SQL text is the one in docs/reads-sql.md,
with literals. Usage: suite.py LABEL [--n 7] [--only prefix]"""
import re, statistics, subprocess, sys

DB = "paylab_bench"
HW, CW = "51dcbf38-ab78-8b0b-acfb-954297fd8a16", "798db295-6cb2-1ab7-5b74-e881e54632b2"
HM, CM = "b2a97f55-6bc8-550a-f91f-be03bd74f45f", "ee7afece-792d-aee9-aefc-91f92bac16bf"

def psql(sql, db=DB):
    p = subprocess.run(["docker", "exec", "-i", "paylab-postgres-bench", "psql", "-U", "paylab", db, "-X", "-q", "-A", "-t", "-F", "|"],
                       input=sql, capture_output=True, text=True)
    if p.returncode or "ERROR" in p.stderr:
        sys.exit(p.stderr + sql)
    return p.stdout

def timeit(sql, n):
    def once():
        out = psql("SET plan_cache_mode=force_custom_plan;\nEXPLAIN (ANALYZE, BUFFERS) " + sql + ";")
        return float(re.search(r"Execution Time: ([\d.]+) ms", out).group(1)), out
    once()
    ts, out = [], ""
    for _ in range(n):
        t, out = once(); ts.append(t)
    node = next((l.strip() for l in out.splitlines() if "Scan" in l or "Aggregate" in l), "")
    return statistics.median(ts), out

def cursor(table, where, offset):
    r = psql(f"SELECT created_at, id FROM {table} WHERE {where} ORDER BY created_at DESC, id DESC OFFSET {offset} LIMIT 1;").strip()
    ts, id_ = r.split("|"); return ts, id_

def queries():
    q = {}
    for name, w in (("hot", HW), ("cold", CW)):
        ts, id_ = cursor("ledger_entries", f"account_id='{w}'", 50000 if name == "hot" else 400)
        q[f"history first page ({name} wallet)"] = f"SELECT id, ledger_transaction_id, direction, amount, created_at FROM ledger_entries WHERE account_id = '{w}'::uuid ORDER BY created_at DESC, id DESC LIMIT 21"
        q[f"history next page, mid ({name} wallet)"] = f"SELECT id, ledger_transaction_id, direction, amount, created_at FROM ledger_entries WHERE account_id = '{w}'::uuid AND (created_at, id) < ('{ts}'::timestamptz, '{id_}'::uuid) ORDER BY created_at DESC, id DESC LIMIT 21"
        q[f"balance ({name} wallet)"] = f"SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance FROM ledger_entries WHERE account_id = '{w}'::uuid"
    cols = "id, source_account_id, destination_account_id, amount, currency, status, failure_reason, ledger_transaction_id, created_at, updated_at"
    for name, m, w in (("hot", HM, "1191324a-9610-74fc-436a-2f92e2cbb212"), ("cold", CM, "3fca1261-7017-6a05-bba8-725532f29486")):
        ts, id_ = cursor("payments", f"merchant_id='{m}'", 30000 if name == "hot" else 3000)
        base = f"SELECT {cols} FROM payments WHERE merchant_id = '{m}'::uuid"
        tail = " ORDER BY created_at DESC, id DESC LIMIT 21"
        q[f"list first page ({name} merchant)"] = base + tail
        q[f"list next page, deep ({name} merchant)"] = base + f" AND (created_at, id) < ('{ts}'::timestamptz, '{id_}'::uuid)" + tail
        q[f"list status=CREATED ({name} merchant)"] = base + " AND status = 'CREATED'::payment_status" + tail
        q[f"list status=FAILED ({name} merchant)"] = base + " AND status = 'FAILED'::payment_status" + tail
        q[f"list account filter ({name} merchant)"] = base + f" AND (source_account_id = '{w}'::uuid OR destination_account_id = '{w}'::uuid)" + tail
        if name == "cold":
            r = "fd7533bd-ded9-46cb-ae98-71065c41d1d1"  # a Wallet of another Merchant: matches almost nothing (worst case)
            q["list account filter, rare match (cold merchant)"] = base + f" AND (source_account_id = '{r}'::uuid OR destination_account_id = '{r}'::uuid)" + tail
        q[f"list period 30d ({name} merchant)"] = base + " AND created_at >= '2026-07-01T00:00:00Z'::timestamptz AND created_at < '2026-07-31T00:00:00Z'::timestamptz" + tail
        for days, lo, hi in (("30d", "2026-07-01", "2026-07-31"), ("90d", "2026-05-31", "2026-08-30")):
            q[f"report {days} ({name} merchant)"] = f"SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, status, count(*)::bigint AS count, sum(amount)::bigint AS volume FROM payments WHERE merchant_id = '{m}'::uuid AND created_at >= '{lo}T00:00:00Z'::timestamptz AND created_at < '{hi}T00:00:00Z'::timestamptz GROUP BY 1, 2 ORDER BY 1 ASC, 2 ASC"
    return q

if __name__ == "__main__":
    label = sys.argv[1]; n = 7
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else ""
    plans = {}
    print(f"### {label}\n\n| query | median ms | top plan node |\n| --- | ---: | --- |")
    for k, sql in queries().items():
        if only not in k: continue
        med, out = timeit(sql, n)
        plans[k] = out
        first = [l.strip() for l in out.splitlines() if re.search(r"(Scan|Bitmap|Aggregate)", l)]
        node = re.sub(r"\s*\(cost.*", "", first[0]) if first else ""
        print(f"| {k} | {med:.3f} | {node} |", flush=True)
    import os
    os.makedirs("docs/experiments/plans", exist_ok=True)
    with open("docs/experiments/plans/" + re.sub(r"[^a-z0-9]+", "-", (label + " " + only).lower()).strip("-") + ".txt", "w") as f:
        for k, v in plans.items():
            f.write(f"===== {k}\n{v}\n")
