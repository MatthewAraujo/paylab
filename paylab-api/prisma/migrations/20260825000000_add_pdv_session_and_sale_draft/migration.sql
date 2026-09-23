-- PDV (point of sale): PdvSession + SaleDraft + SaleDraftItem, a nullable
-- per-store-unique ProductVariant.barcode, and the CASH payment method.
-- See docs/PRD-PDV.md and ADR 0003-0005.

-- CreateEnum
CREATE TYPE "PdvSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SaleDraftStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "OrderPaymentMethod" ADD VALUE 'CASH';

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "barcode" TEXT;

-- CreateTable
CREATE TABLE "pdv_sessions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "opened_by_user_id" TEXT NOT NULL,
    "status" "PdvSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "pdv_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_drafts" (
    "id" TEXT NOT NULL,
    "pdv_session_id" TEXT NOT NULL,
    "status" "SaleDraftStatus" NOT NULL DEFAULT 'OPEN',
    "unmatched_barcodes" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_draft_items" (
    "id" TEXT NOT NULL,
    "sale_draft_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_draft_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pdv_sessions_store_id_status_idx" ON "pdv_sessions"("store_id", "status");

-- CreateIndex
CREATE INDEX "sale_drafts_pdv_session_id_status_idx" ON "sale_drafts"("pdv_session_id", "status");

-- CreateIndex
CREATE INDEX "sale_draft_items_sale_draft_id_idx" ON "sale_draft_items"("sale_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_draft_items_sale_draft_id_variant_id_key" ON "sale_draft_items"("sale_draft_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_store_id_barcode_key" ON "product_variants"("store_id", "barcode");

-- AddForeignKey
ALTER TABLE "pdv_sessions" ADD CONSTRAINT "pdv_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_drafts" ADD CONSTRAINT "sale_drafts_pdv_session_id_fkey" FOREIGN KEY ("pdv_session_id") REFERENCES "pdv_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_draft_items" ADD CONSTRAINT "sale_draft_items_sale_draft_id_fkey" FOREIGN KEY ("sale_draft_id") REFERENCES "sale_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_draft_items" ADD CONSTRAINT "sale_draft_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique indexes (Prisma cannot express these natively): at most one
-- OPEN PdvSession per store, and at most one OPEN SaleDraft per session. This
-- is the actual DB-level guard against concurrent double-open (see T5's
-- concurrency test) — application-level checking alone cannot survive a race.
CREATE UNIQUE INDEX "pdv_sessions_one_open_per_store" ON "pdv_sessions" ("store_id") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "sale_drafts_one_open_per_session" ON "sale_drafts" ("pdv_session_id") WHERE "status" = 'OPEN';
