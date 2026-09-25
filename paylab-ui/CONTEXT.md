# PayLab UI Domain Language

## Product surface

**Operational Console**:
The internal web interface used to observe and operate PayLab. It exposes backend behavior without becoming a separate source of financial truth.
_Avoid_: Customer portal, banking app, admin CRUD

**Capability Availability**:
Whether a backend capability is present in the generated OpenAPI contract and can be used by the Operational Console. An unavailable capability is shown honestly; it is never replaced by invented production data.
_Avoid_: Mock mode, fake fallback

## Access model

**Operational Console access**:
The console has no login and is read-only. It reads one Merchant's data through a Merchant API key held in a server-only environment variable, so the browser never sees a credential. Creating Wallets or Payments is done through the API, not the console.
_Avoid_: User login, customer session, admin CRUD

## Benchmarks

**Benchmark Run**:
An immutable, explicitly initiated execution of a defined backend performance scenario from a clean source revision on the approved local benchmark environment, identified by that revision and an optional intent note. Once published automatically, the Operational Console observes Benchmark Runs but does not create or alter their measurements.
_Avoid_: Benchmark report, latest metrics, editable result

**Benchmark Run Status**:
The lifecycle state presented by the console: `RUNNING` while progress and Artifacts are being produced, `COMPLETED` after every scenario succeeds, or `INCOMPLETE` after interruption or failure. Measurements become immutable when the Run leaves `RUNNING`.
_Avoid_: Passed/failed metric, editable completion state

**Benchmark Suite**:
The complete set of performance scenarios known by a source revision. A Benchmark Run represents the entire Benchmark Suite, even when the console filters its measurements for analysis.
_Avoid_: Partial run, test selection, benchmark filter

**Benchmark Summary**:
The canonical, durable record used by the Operational Console to present a Benchmark Run's provenance, outcome, and normalized measurements. Large diagnostic artifacts remain supporting evidence rather than dashboard data.
_Avoid_: Raw log, console output, editable dashboard data

**Benchmark Baseline**:
A Benchmark Run deliberately retained as a stable long-term comparison reference. It is distinct from the previous compatible Benchmark Run, which remains the console's default comparison reference.
_Avoid_: Previous run, latest run, target

**Benchmark Comparison**:
A comparison between one Benchmark Run and another compatible Run. The console selects the previous compatible Run by default and lets the operator choose another Run or the Benchmark Baseline.
_Avoid_: Diff against latest, cross-environment comparison

**Comparable Benchmark Scenario**:
A scenario whose identity, definition, dataset, and relevant execution environment are equivalent across two Benchmark Runs. The console compares compatible scenarios independently and labels new, removed, or changed scenarios instead of calculating misleading deltas.
_Avoid_: Same display name, same suite membership, cross-environment metric

**Performance Change**:
The direction-normalized difference between compatible measurements: improved, stable, or regressed. A change is stable within a five-percent tolerance; higher throughput is favorable, while lower latency, contention, retry, and failure measurements are favorable.
_Avoid_: Any difference is a regression, raw percentage without direction

**Incomplete Benchmark Run**:
A Benchmark Run whose Benchmark Suite did not finish successfully. It remains visible with its completed measurements and failure evidence, but the console excludes it from comparisons and Baseline selection.
_Avoid_: Failed metric, comparable partial run, discarded run

**Imported Benchmark Run**:
A historical Benchmark Run reconstructed from trustworthy experiment results that predate the canonical executor. The console discloses its imported provenance and leaves unavailable measurements empty rather than inferring them.
_Avoid_: Synthetic run, inferred measurement, native run

**Benchmark Artifact**:
Sanitized diagnostic evidence attached to a Benchmark Run, such as execution logs, query plans, and failure output. Artifacts have no automatic expiration; the console may display or download them but does not treat them as normalized measurements.
_Avoid_: Benchmark Summary, unsanitized process output, dashboard metric

### Benchmark console decisions

- **Browser-direct reads.** Benchmark data is non-financial and unauthenticated, so the browser reads `/v1/benchmarks/*` directly (like System Health) instead of a server proxy. The Merchant key never travels to these routes, and financial routes stay server-only.
- **Local-only boundary.** The API exposes the benchmark routes only in development (or `BENCHMARK_ENABLED=true`). A disabled capability, an unreachable API and a missing Run are different states with different wording; none is replaced by invented data.
- **Observe, with one write.** The console never runs, pauses or cancels a Benchmark Run. Selecting the Benchmark Baseline is the only write; it changes a pointer file that appears as a reviewable Git change, and the console never commits or pushes.
- **Zero reference.** Following the design, 0 to 0 is Stable; a move away from zero is classified by metric direction and shown without a percentage. This intentionally differs from the API's unused `classifyChange`.
- **Error rate.** Shown as "not declared" when a Run's scenario declares no error-rate measurement; it is never computed or defaulted to zero.
- **Trends.** Points follow Run order, not calendar time, and the chart is plain SVG with no charting dependency. Timestamps are UTC.

## Accounts

**Merchant**:
A fictional company that uses the PayLab API and owns one or more Wallets.
_Avoid_: Customer, client, store, tenant

**Account**:
A logical container of Balance that appears on Ledger Entries. Every Account is either a Wallet or an External Clearing Account.
_Avoid_: Balance holder, bank account

**Wallet**:
An Account owned by a Merchant that holds that Merchant's funds inside PayLab.
_Avoid_: Merchant account, customer account

**External Clearing Account**:
A platform-owned Account representing the world outside PayLab. It is the counterpart of movements into or out of the platform.
_Avoid_: Settlement account, bank account, suspense account

## Payments and ledger

**Payment**:
A request to move an Amount between two Accounts together with its lifecycle state. It is the intent; the ledger is the fact.
_Avoid_: Transaction, charge, transfer

**Ledger Transaction**:
The accounting record of one consummated financial event, made of two or more Ledger Entries that balance to zero.
_Avoid_: Transaction (alone), journal, posting

**Ledger Entry**:
One immutable debit or credit line of a Ledger Transaction against an Account.
_Avoid_: Movement, line item, record

**Settlement**:
The atomic step in which a Payment's Ledger Transaction is written and the Payment becomes `SUCCEEDED`. Funds sufficiency is decided at this moment.
_Avoid_: Capture, posting, completion

**Balance**:
The net sum of an Account's Ledger Entries, credits minus debits. It is derived from the ledger and is not independently stored.
_Avoid_: Funds, available amount, stored balance

**Amount**:
A positive monetary value in the smallest unit of its currency. September supports BRL centavos represented as integers.
_Avoid_: Value, price, floating-point money

**Idempotency Key**:
A Merchant-scoped client value identifying one intended Payment so that retrying the same request cannot create a second Payment.
_Avoid_: Request id, dedup token
