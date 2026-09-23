# Post the ledger and settle the Payment in one atomic transaction

Status: accepted (September scope; expected to be superseded when FakeBank makes `PROCESSING` an asynchronous external operation)

In September a Payment writes to the ledger only when it succeeds: the LedgerTransaction with its LedgerEntries and the Payment's move to `SUCCEEDED` commit in the same database transaction, and the sufficient-funds check runs under a lock on the debited Wallet inside that transaction. The ledger therefore holds only consummated facts and there is no hold or reservation account.

We rejected reserving funds on entering `PROCESSING` for now because, with no real external call, `PROCESSING` carries no financial exposure. Once the FakeBank integration makes `PROCESSING` a real, long window, it becomes an exposure that must reserve balance, and the model moves to reserve-on-`PROCESSING` with a hold Account, settlement on `SUCCEEDED`, and a compensating entry on `FAILED`.
