-- DropIndex
DROP INDEX "merchandising_featured_categories_store_id_segment_position_idx";

-- DropIndex
DROP INDEX "merchandising_featured_categories_store_id_segment_position_key";

-- AlterTable
ALTER TABLE "merchandising_featured_categories" DROP COLUMN "segment";

-- DropEnum
DROP TYPE "MerchandisingFeaturedCategorySegment";

-- CreateIndex
CREATE INDEX "merchandising_featured_categories_store_id_position_idx" ON "merchandising_featured_categories"("store_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "merchandising_featured_categories_store_id_position_key" ON "merchandising_featured_categories"("store_id", "position");

