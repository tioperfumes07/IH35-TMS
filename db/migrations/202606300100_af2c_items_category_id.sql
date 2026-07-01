-- [HOLD-FOR-JORGE — TIER 1] AF-2c — catalogs.items.category_id (item → per-entity Category link).
-- POSTS NOTHING. Adds the referential Category link QBO/NetSuite model as a real record reference
-- (QBO "Category" list, many-items-to-one-category) rather than freeform text. Same-entity composite
-- FK to catalogs.qbo_categories (already per-entity) so an item can never point at another entity's
-- category. Requires catalogs.items.operating_company_id (AF-2, migration 202606300080) — guarded.
-- Idempotent + fresh-DB safe. Runs on a Neon branch only. DO NOT MERGE / RUN ON PROD without Jorge's
-- JORGE-APPROVED ceremony (§1.4 — catalogs.* schema change).

BEGIN;

-- 1) add per-entity Category link column on items (nullable — an item may be uncategorized, QBO-style)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='catalogs' AND table_name='items' AND column_name='category_id') THEN
    ALTER TABLE catalogs.items ADD COLUMN category_id uuid;
  END IF;
END $$;

-- 2) composite unique on qbo_categories so items can reference (operating_company_id, id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='uq_qbo_categories_company_id' AND conrelid='catalogs.qbo_categories'::regclass) THEN
    ALTER TABLE catalogs.qbo_categories ADD CONSTRAINT uq_qbo_categories_company_id
      UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- 3) same-entity composite FK (only if items already carries operating_company_id from AF-2)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='items' AND column_name='operating_company_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname='items_category_same_entity_fkey' AND conrelid='catalogs.items'::regclass) THEN
      ALTER TABLE catalogs.items ADD CONSTRAINT items_category_same_entity_fkey
        FOREIGN KEY (operating_company_id, category_id)
        REFERENCES catalogs.qbo_categories (operating_company_id, id);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_category_id ON catalogs.items (category_id);

-- No RLS/grant change: catalogs.items entity RLS + ih35_app grants are already in place (AF-2).

COMMIT;
