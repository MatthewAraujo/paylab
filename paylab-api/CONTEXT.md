# PayLab

A fictional payment processing platform. Fictional companies use an API to create payments and transfers between accounts, and the platform records every money movement in a double-entry ledger.

## Language

### Accounts

**Merchant**:
A fictional company that uses the PayLab API and owns one or more Wallets.
_Avoid_: Customer, client, store, tenant

**Account**:
A logical container of balance that appears on ledger entries. Every Account is either a Wallet or an External Clearing Account.
_Avoid_: Balance holder, bank account

**Wallet**:
An Account owned by a Merchant that holds that Merchant's funds inside PayLab.
_Avoid_: Merchant account, customer account

**External Clearing Account**:
A platform-owned Account that stands for the world outside PayLab (provider, bank). It is the counterpart of every movement of funds into or out of the platform, so the sum of all ledger entries is always zero.
_Avoid_: Settlement account, bank account, suspense account

### Payments and ledger

**Payment**:
A request to move an amount between two Accounts, together with its lifecycle state. It is the intent; the ledger is the fact.
_Avoid_: Transaction, charge, transfer

**Ledger Transaction**:
The accounting record of one consummated financial event, made of two or more Ledger Entries that balance to zero. It is created only when the event has actually happened.
_Avoid_: Transaction (alone), journal, posting

**Ledger Entry**:
One debit or credit line of a Ledger Transaction against a single Account. Entries are never edited or deleted; a correction is always a new compensating Ledger Transaction.
_Avoid_: Movement, line item, record

**Settlement**:
The single atomic step where a Payment's Ledger Transaction is written and the Payment becomes `SUCCEEDED`. Funds sufficiency is decided at this moment, not earlier.
_Avoid_: Capture, posting, completion

**Balance**:
The net sum of an Account's Ledger Entries, credits minus debits. It is derived from the ledger, never stored as an independent value.
_Avoid_: Funds, available amount, stored balance

**Balance Consumer**:
A Payment whose source is a Wallet, and therefore the only kind of Payment that must prove sufficient funds at Settlement. A Payment sourced from an External Clearing Account is not one.
_Avoid_: Debit payment, outgoing payment

**Idempotency Key**:
A client-chosen value, unique per Merchant, that identifies one intended Payment so that repeating the same request never creates a second Payment.
_Avoid_: Request id, dedup token

**Amount**:
A monetary value in the smallest unit of its currency (centavos for BRL), stored as an integer and never as a floating-point number. Each Account and Payment carries a currency; September operates in BRL only.
_Avoid_: Value, price, decimal money

## Performance facts (T13)

**Benchmark Run**:
One immutable, explicitly initiated execution of a defined performance scenario from a clean source revision on the approved local benchmark environment, including its parameters, measurements, outcome, and optional intent note. A published Benchmark Run becomes available to the Operational Console automatically and is never overwritten by a later run.
_Avoid_: Benchmark report, latest metrics, mutable result

**Benchmark Run Status**:
The lifecycle state of a Benchmark Run: `RUNNING` while the suite is producing progress and Artifacts, `COMPLETED` after every scenario succeeds, or `INCOMPLETE` after interruption or failure. Measurements become immutable when the Run leaves `RUNNING`.
_Avoid_: Passed/failed metric, editable completion state

**Benchmark Suite**:
The complete set of performance scenarios known by a source revision. Every Benchmark Run executes the whole Benchmark Suite; ad hoc or partial measurements are not published as Benchmark Runs.
_Avoid_: Test selection, partial benchmark, benchmark filter

**Benchmark Summary**:
The canonical, durable record of a Benchmark Run's identity, provenance, outcome, and normalized measurements. Large diagnostic artifacts may support a Benchmark Summary but do not replace it.
_Avoid_: Raw log, console output, mutable dashboard data

**Benchmark Baseline**:
A Benchmark Run deliberately retained as a stable long-term comparison reference. It is distinct from the previous compatible Benchmark Run, which remains the default comparison reference.
_Avoid_: Previous run, latest run, target

**Benchmark Comparison**:
A comparison between one Benchmark Run and another compatible Run. The previous compatible Run is selected by default, while an operator may select a different Run or the Benchmark Baseline.
_Avoid_: Diff against latest, cross-environment comparison

**Comparable Benchmark Scenario**:
A scenario whose identity, definition, dataset, and relevant execution environment are equivalent across two Benchmark Runs. Compatibility is evaluated per scenario, so newly added scenarios do not invalidate comparisons for unchanged scenarios.
_Avoid_: Same display name, same suite membership, cross-environment metric

**Performance Change**:
The direction-normalized difference between compatible measurements: improved, stable, or regressed. A change is stable within a five-percent tolerance; higher throughput is favorable, while lower latency, contention, retry, and failure measurements are favorable.
_Avoid_: Any difference is a regression, raw percentage without direction

**Incomplete Benchmark Run**:
A Benchmark Run whose Benchmark Suite did not finish successfully. It retains the completed measurements and failure evidence for diagnosis but is ineligible for comparison and cannot become a Benchmark Baseline.
_Avoid_: Failed metric, comparable partial run, discarded run

**Imported Benchmark Run**:
A historical Benchmark Run reconstructed from trustworthy experiment results that predate the canonical executor. Missing measurements remain absent, and its imported provenance is always disclosed.
_Avoid_: Synthetic run, inferred measurement, native run

**Benchmark Artifact**:
Sanitized diagnostic evidence attached to a Benchmark Run, such as execution logs, query plans, and failure output. Artifacts are retained locally without automatic expiration and support, but do not replace, the Benchmark Summary.
_Avoid_: Benchmark Summary, unsanitized process output, dashboard metric

Measured on the benchmark dataset; details and rejected alternatives are in the ADRs, not here.

- Commit cost of a Settlement depends on an index the schema does not get from constraints: the deferred integrity trigger looks up entries by `ledger_transaction_id`. Without it the commit scans the whole ledger (linear, ~225 ms at 1.9 M entries) while the source Wallet lock is held (ADR 0005).
- The Balance of a Wallet is an index-only scan whose cost grows linearly with that Wallet's entries (~0.11 ms per thousand). It is also the lock hold time, so it caps how fast one Wallet can be debited (ADRs 0006, 0009).
- History and the Payment list are keyset-only; offset was measured and turns into a cliff on deep pages (ADR 0008). Listing by `accountId` for a small Merchant can hit a planner misestimate (22 ms instead of ~2 ms), left as a follow-up (ADR 0007).

## Benchmark observability: decisions and known risks

What is not obvious from the code; the operating guide is [docs/benchmark.md](docs/benchmark.md) and the plan is in [docs/benchmark-observability/](docs/benchmark-observability/).

- **A Run is the whole suite, published only from a clean commit.** `benchmark:run` refuses a dirty or untracked worktree, holds an exclusive lock, and never commits. The generated Summary (and any Baseline change) leaves the worktree dirty on purpose, so the next Run is blocked until the developer has reviewed and committed it. Artifacts (`.benchmark/`) are ignored and never expire.
- **Every Run restores the benchmark database from a template and migrates it.** `paylab_bench` is dropped and recreated each time (and once per repetition inside each T14 cell). The schema state is therefore the revision under test, and it is deliberately not part of the dataset fingerprint: an index change is the change being measured. The dataset fingerprint is the data digest.
- **T14 is one scenario per matrix cell, with the strategy as a metric dimension.** The Latin-square rotation and the per-block reset need the five strategies to share a block, which a one-result-per-scenario process cannot express. Metrics are matched by key plus `dimensions`; `NEUTRAL` metrics (sample counts) are informational and never classified.
- **The correctness gate encodes the recorded outcome, not "all pass".** `FOR UPDATE` deadlocking on crossed transfers is a documented finding (ADR 0010) and is tolerated for that one strategy; any other failure or invariant violation makes the Run incomplete.
- **Imported Runs never invent data.** T13 is imported as two Runs (baseline and adopted schema, measured in one session) and T14 as a third; commit, branch, and finish time are unknown, T13 has only the recording date, and imported and native scenario definitions differ on purpose, so native versus imported shows "changed" until a native reference exists.
- **The read API is a local developer surface.** Off outside development, refused at boot in production, 404 when off, no Merchant authentication, no database; clients never name paths; text is sanitized on write and again on read. The only write is the Baseline pointer (`bench/baseline.json`).
- **Known risks.** A T14 Summary is large (about 555 KB, because label, unit, and direction repeat per strategy and cell), so versioning many Runs grows the repository; a compact form is an open decision. Timings drift between sessions on this laptop (only same-session comparisons are trustworthy) and the 5% band is a presentation tolerance, not significance. An imported Run's environment facts are quoted from documents, so a native Run may show as environment-incompatible.
