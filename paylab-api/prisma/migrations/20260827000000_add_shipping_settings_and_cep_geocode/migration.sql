-- Distance-based local delivery fee (ADR 0007). Two new tables:
--   store_shipping_settings — 1:1 per-store shipping configuration
--   cep_geocodes            — persistent, global CEP -> coordinates cache
--
-- Hand-written and applied via `prisma db execute` (dev + test DBs) then
-- `prisma migrate resolve --applied`, because `prisma migrate dev` refuses to
-- run against this database: the Better Auth tables were provisioned outside
-- Prisma's migration history, so Prisma reports drift and wants a destructive
-- reset. Same workaround as 20260822220000_add_orders. See TASK.md.

-- CreateTable
CREATE TABLE "store_shipping_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "origin_postal_code" TEXT NOT NULL,
    "base_cents" INTEGER NOT NULL,
    "per_km_cents" INTEGER NOT NULL,
    "max_distance_km" INTEGER NOT NULL,
    "free_shipping_distance_km" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_shipping_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cep_geocodes" (
    "id" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'nominatim',
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cep_geocodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_shipping_settings_store_id_key" ON "store_shipping_settings"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "cep_geocodes_postal_code_key" ON "cep_geocodes"("postal_code");

-- AddForeignKey
ALTER TABLE "store_shipping_settings" ADD CONSTRAINT "store_shipping_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
