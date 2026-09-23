-- CreateTable
CREATE TABLE "customer_favorites" (
    "id" TEXT NOT NULL,
    "store_customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_favorites_product_id_idx" ON "customer_favorites"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_favorites_store_customer_id_product_id_key" ON "customer_favorites"("store_customer_id", "product_id");

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_store_customer_id_fkey" FOREIGN KEY ("store_customer_id") REFERENCES "store_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
