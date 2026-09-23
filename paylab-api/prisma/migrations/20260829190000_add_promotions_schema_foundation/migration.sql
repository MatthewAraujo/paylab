-- Promotions schema foundation (ADR 0011 / PRD-PROMOTIONS, task T1).
--
-- Adds:
--   promotions          — store-scoped commercial campaigns (JSON conditions/benefits)
--   curated_home_offers — operator-curated storefront "ofertas" lane, store-scoped FK
--   orders.*            — richer commercial discount snapshot (base vs final, discounts)
--   order_items.*       — per-line promotion allocation fields
--
-- Hand-written and applied via `prisma db execute` (dev + test DBs) then
-- `prisma migrate resolve --applied`, because `prisma migrate dev` refuses to run
-- against this database: the Better Auth tables (account/session/user/verification)
-- were provisioned outside Prisma's migration history, so Prisma reports drift and
-- wants a destructive reset. Same workaround as 20260822220000_add_orders and
-- 20260827000000_add_shipping_settings_and_cep_geocode. See TASK.md.
--
-- The generated diff also proposes dropping the Better Auth tables; those DROP
-- statements are intentionally omitted here.

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PromotionVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PromotionChannel" AS ENUM ('ECOMMERCE', 'PDV');

-- CreateEnum
CREATE TYPE "PromotionTargetScope" AS ENUM ('ELIGIBLE_ITEMS', 'ORDER_SUBTOTAL', 'SHIPPING');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "base_line_total_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "base_unit_price_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "line_discount_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unit_discount_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "applied_promotions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "base_subtotal_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "item_discount_total_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_base_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_discount_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_discount_cents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "PromotionVisibility" NOT NULL DEFAULT 'PRIVATE',
    "channels" "PromotionChannel"[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_stackable" BOOLEAN NOT NULL DEFAULT false,
    "target_scope" "PromotionTargetScope" NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "public_highlight" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curated_home_offers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curated_home_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_store_id_status_visibility_idx" ON "promotions"("store_id", "status", "visibility");

-- CreateIndex
CREATE INDEX "promotions_store_id_priority_created_at_idx" ON "promotions"("store_id", "priority", "created_at");

-- CreateIndex
CREATE INDEX "promotions_store_id_starts_at_ends_at_idx" ON "promotions"("store_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_id_store_id_key" ON "promotions"("id", "store_id");

-- CreateIndex
CREATE INDEX "curated_home_offers_store_id_position_idx" ON "curated_home_offers"("store_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "curated_home_offers_promotion_id_store_id_key" ON "curated_home_offers"("promotion_id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "curated_home_offers_store_id_position_key" ON "curated_home_offers"("store_id", "position");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_home_offers" ADD CONSTRAINT "curated_home_offers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_home_offers" ADD CONSTRAINT "curated_home_offers_promotion_id_store_id_fkey" FOREIGN KEY ("promotion_id", "store_id") REFERENCES "promotions"("id", "store_id") ON DELETE CASCADE ON UPDATE CASCADE;
