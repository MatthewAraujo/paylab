#!/usr/bin/env python3
"""Experiment helper (T13): keyset versus offset on the hot Wallet at increasing depth.
Usage: depth.py LABEL"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from suite import timeit, cursor, HW

label = sys.argv[1]
print(f"### {label}\n\n| depth (rows skipped) | keyset ms | offset ms | keyset node | offset node |\n| ---: | ---: | ---: | --- | --- |")
plans = {}
for d in (0, 1000, 10000, 50000, 90000):
    sel = "id, ledger_transaction_id, direction, amount, created_at"
    off = f"SELECT {sel} FROM ledger_entries WHERE account_id = '{HW}'::uuid ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET {d}"
    if d == 0:
        key = f"SELECT {sel} FROM ledger_entries WHERE account_id = '{HW}'::uuid ORDER BY created_at DESC, id DESC LIMIT 21"
    else:
        ts, id_ = cursor("ledger_entries", f"account_id='{HW}'", d - 1)
        key = f"SELECT {sel} FROM ledger_entries WHERE account_id = '{HW}'::uuid AND (created_at, id) < ('{ts}'::timestamptz, '{id_}'::uuid) ORDER BY created_at DESC, id DESC LIMIT 21"
    (mk, pk), (mo, po) = timeit(key, 7), timeit(off, 7)
    import re
    node = lambda p: re.sub(r"\s*\(cost.*|^\s*->\s*", "", next(l for l in p.splitlines() if re.search(r"(Scan|Bitmap)", l))).strip()
    print(f"| {d} | {mk:.3f} | {mo:.3f} | {node(pk)} | {node(po)} |", flush=True)
    plans[d] = (pk, po)
os.makedirs("docs/experiments/plans", exist_ok=True)
with open("docs/experiments/plans/" + label.lower().replace(" ", "-") + ".txt", "w") as f:
    for d, (pk, po) in plans.items():
        f.write(f"===== depth {d}: keyset\n{pk}\n===== depth {d}: offset\n{po}\n")
