-- CreateEnum
CREATE TYPE "StoreCustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('NEW', 'REGULAR', 'VIP', 'AT_RISK', 'DORMANT');

-- CreateEnum
CREATE TYPE "CRMInteractionType" AS ENUM ('NOTE', 'EMAIL', 'PHONE_CALL', 'CHAT', 'SUPPORT_TICKET');

-- CreateEnum
CREATE TYPE "CRMInteractionChannel" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'IN_PERSON', 'SYSTEM');

-- CreateTable
CREATE TABLE "store_customers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_profile_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" "StoreCustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent_cents" INTEGER NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_customer_addresses" (
    "id" TEXT NOT NULL,
    "store_customer_id" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_profiles" (
    "id" TEXT NOT NULL,
    "store_customer_id" TEXT NOT NULL,
    "segment" "CustomerSegment" NOT NULL DEFAULT 'NEW',
    "tags" TEXT[],
    "notes" TEXT,
    "last_contact_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interactions" (
    "id" TEXT NOT NULL,
    "crm_profile_id" TEXT NOT NULL,
    "type" "CRMInteractionType" NOT NULL,
    "channel" "CRMInteractionChannel" NOT NULL,
    "subject" TEXT,
    "content" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_customers_store_id_status_idx" ON "store_customers"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "store_customers_store_id_customer_profile_id_key" ON "store_customers"("store_id", "customer_profile_id");

-- CreateIndex
CREATE INDEX "store_customer_addresses_store_customer_id_idx" ON "store_customer_addresses"("store_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_profiles_store_customer_id_key" ON "crm_profiles"("store_customer_id");

-- CreateIndex
CREATE INDEX "crm_interactions_crm_profile_id_created_at_idx" ON "crm_interactions"("crm_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "store_customers" ADD CONSTRAINT "store_customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_customer_addresses" ADD CONSTRAINT "store_customer_addresses_store_customer_id_fkey" FOREIGN KEY ("store_customer_id") REFERENCES "store_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_profiles" ADD CONSTRAINT "crm_profiles_store_customer_id_fkey" FOREIGN KEY ("store_customer_id") REFERENCES "store_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_crm_profile_id_fkey" FOREIGN KEY ("crm_profile_id") REFERENCES "crm_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
