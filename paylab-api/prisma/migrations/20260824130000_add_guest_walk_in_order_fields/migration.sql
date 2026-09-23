-- Guest walk-in orders: storeCustomerId becomes optional, and an order may
-- instead carry a guest identity (name + phone) directly. Exactly one of the
-- two is enforced in the domain (Order.create()), not by a DB constraint.

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "store_customer_id" DROP NOT NULL;
ALTER TABLE "orders" ADD COLUMN "guest_name" TEXT;
ALTER TABLE "orders" ADD COLUMN "guest_phone" TEXT;
