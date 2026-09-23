-- Remove the variant "compare-at price" field.
--
-- Product decision: a markdown / "de-por" is expressed as a Promotion, never as a
-- second price on the variant. The catalog keeps exactly two money fields per
-- variant: `price` (price_cents) and `cost` (cost_cents).
--
-- Hand-written and applied via `prisma db execute` (dev + test DBs) then
-- `prisma migrate resolve --applied`, because `prisma migrate dev` refuses to run
-- against this database: the Better Auth tables (account/session/user/verification)
-- were provisioned outside Prisma's migration history, so Prisma reports drift and
-- wants a destructive reset. Same workaround as 20260822220000_add_orders,
-- 20260827000000_add_shipping_settings_and_cep_geocode, and
-- 20260829190000_add_promotions_schema_foundation. See TASK.md.
--
-- The generated diff also proposes dropping the Better Auth tables; those DROP
-- statements are intentionally omitted here.

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "compare_at_cents";
