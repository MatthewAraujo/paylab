# Keep deriving the Balance from the ledger; a materialized Balance is a proposal with explicit triggers

Status: accepted for September (proposal only; nothing is implemented)

**Problem.** The Balance is a sum over a Wallet's entries and is computed inside Settlement under the row lock
(ADR 0002), so its cost is the lock hold time. Is a stored or materialized Balance justified?

**Measurement** ([results](../experiments/T13-results.md), sections 5 and 6). With ADR 0006's index: Balance 13 ms
for the hottest Wallet of the dataset (95 k entries), 56 ms at 495 k and 108 ms at 995 k entries, linear
(about 0.11 ms per thousand). A Balance running while another session holds `FOR NO KEY UPDATE` on the same
Wallet took 14.2 ms versus 14.1 ms alone: reads never wait on the lock. Debits of one Wallet are serialized by
design; the rate is `1 / lock hold time`: 3.5 per second before the T13 indexes, 83 to 95 per second after (lock
hold about 10 ms), and about 9 per second on a Wallet of one million entries.

**Alternatives.** (a) Keep deriving (chosen). (b) A stored balance column updated in the Settlement transaction:
faster, but it is a second copy of a fact that CONTEXT.md defines as derived and creates a way for the two to
disagree. (c) A checkpointed Balance (a watermark plus the sum of newer entries, maintained in the same
transaction under the same lock, verified against the full sum by a test and a periodic check): keeps the ledger
authoritative and bounds the hold time; it is the design to pick if needed.

**Choice.** Do not materialize in September. Reconsider when a Wallet's Balance exceeds about 50 ms (roughly
500 k entries on this machine) or a single Wallet must sustain more than about 50 debits per second. T14
measures whether other locking strategies change that ceiling.

**Guarantee.** No stored balance, so no drift; the global invariant helper keeps checking the derived sum.

**Cost.** Settlement latency for very large Wallets grows linearly until this decision is revisited.
