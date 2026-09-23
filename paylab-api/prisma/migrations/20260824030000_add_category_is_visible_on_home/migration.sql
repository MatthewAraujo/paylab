-- AlterTable
-- Add the flag with a safe (false) default first, then backfill it below in the
-- same migration. A naive `false` default with no backfill would make every
-- currently-visible department/child vanish from the storefront home on deploy —
-- see docs/archived/19-bugfixes-catalog-inventory-orders/README.md
-- (Risk Plan) and T3-category-home-visibility.md.
ALTER TABLE "categories" ADD COLUMN "is_visible_on_home" BOOLEAN NOT NULL DEFAULT false;

-- Backfill 1: every currently-active root category shows on the home today
-- (getHome() has never filtered root categories by anything other than status) —
-- preserve that by marking them visible.
UPDATE "categories"
SET "is_visible_on_home" = true
WHERE "parent_category_id" IS NULL
  AND "status" = 'ACTIVE';

-- Backfill 2: every child category already curated into the home via
-- merchandising_featured_categories is, by definition, currently visible —
-- preserve that too.
UPDATE "categories"
SET "is_visible_on_home" = true
WHERE "id" IN (SELECT "category_id" FROM "merchandising_featured_categories");
