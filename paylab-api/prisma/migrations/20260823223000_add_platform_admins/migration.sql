-- CreateTable
CREATE TABLE "platform_admins" (
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "store_member_provisioning_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "created_user_id" TEXT NOT NULL,
    "created_email" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_member_provisioning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_member_provisioning_logs_store_id_created_at_idx" ON "store_member_provisioning_logs"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "store_member_provisioning_logs" ADD CONSTRAINT "store_member_provisioning_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
