# Prisma for schema and CRUD, raw SQL for the ledger's critical paths

Status: accepted

Prisma stays for the schema, migrations and ordinary reads and writes, inherited from the reference architecture. The Settlement, balance computation, keyset history queries and benchmarks use raw SQL (`$queryRaw` inside an interactive transaction), because they need explicit control over locks (`FOR NO KEY UPDATE`), isolation level and the exact query plan, which Prisma's query API hides. Triggers and deferred constraints are hand-written SQL migrations.

We rejected replacing Prisma with a query builder or plain `pg` to keep the reference architecture reusable while still learning what PostgreSQL actually does. Revisit if the raw SQL surface grows beyond the ledger core.
