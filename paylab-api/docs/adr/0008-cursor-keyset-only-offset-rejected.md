# The public contract is cursor-only keyset pagination; offset stays out of the API

Status: accepted (T13 confirms the T11 decision with measurements)

**Problem.** T11 exposes history, Payment list and report pages. Offset pagination is the common default; the
question is whether its cost justifies keeping it out of the contract.

**Measurement** ([results](../experiments/T13-results.md), section 6). First page of 21 for the hot Wallet (95 k
entries), with the ADR 0006 index: keyset 0.11 to 0.17 ms at every depth (15 buffers). Offset: 0.11 ms at 0, 0.68 ms
at 1,000, 5.3 ms at 10,000, then a plan switch to a bitmap scan of all 95 k rows plus a sort: 78 ms at 50,000 and
81 ms at 90,000. Without any index both are a sequential scan (about 58 ms) and the difference is invisible, which
is why the experiment had to be repeated after the index existed.

**Alternatives.** Offset and limit: rejected, its cost depends on how deep the caller pages and it can flip to a
cliff; it also repeats or skips rows when entries are inserted between requests (T11 e2e tests). Keyset with
page numbers: not possible. Offset only in experiments (the T14 benchmark): allowed, never routed.

**Choice.** Cursor-only keyset on `(created_at DESC, id DESC)`, compared as a row value, as implemented in T11.

**Guarantee.** Stable pages under concurrent inserts (the pair is unique) and constant cost per page, whatever
the depth.

**Cost.** No random access to page N and no total count; the checksum in the cursor is not a security control.
