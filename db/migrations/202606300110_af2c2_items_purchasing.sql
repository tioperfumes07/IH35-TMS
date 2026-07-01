-- [HOLD-FOR-JORGE — TIER 1] AF-2c.2 — full QBO two-sided item: Purchasing info + Preferred vendor.
-- POSTS NOTHING. Completes the QBO "I purchase this…" side that catalogs.items could not persist:
--   purchase_description  — shown on POs / bills / checks / expenses (QBO "Purchase description")
--   purchase_cost_cents   — the buy cost (distinct from the sell unit_price_cents)
--   preferred_vendor_id   — QBO "Preferred vendor", a REAL same-entity reference to mdata.vendors
--                           (the per-entity vendor master), NOT free text.
-- Preferred vendor uses the same same-entity composite-FK pattern as AF-1/AF-2/AF-3 so an item can
-- never point at another entity's vendor. Requires catalogs.items.operating_company_id (AF-2) — guarded.
-- Idempotent + fresh-DB safe. Runs on a Neon branch only. DO NOT MERGE / RUN ON PROD without Jorge's
-- JORGE-APPROVED ceremony (§1.3 — DB migration).

BEGIN;

-- 1) purchasing columns (nullable — the buy side is optional, QBO-style)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='catalogs' AND table_name='items' AND column_name='purchase_description') THEN
    ALTER TABLE catalogs.items ADD COLUMN purchase_description text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='catalogs' AND table_name='items' AND column_name='purchase_cost_cents') THEN
    ALTER TABLE catalogs.items ADD COLUMN purchase_cost_cents bigint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='catalogs' AND table_name='items' AND column_name='preferred_vendor_id') THEN
    ALTER TABLE catalogs.items ADD COLUMN preferred_vendor_id uuid;
  END IF;
END $$;

-- 2) composite unique on mdata.vendors so items can reference (operating_company_id, id)
--    (id is already the PK, so this is trivially satisfied; it just enables the composite FK below).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='uq_vendors_company_id' AND conrelid='mdata.vendors'::regclass) THEN
    ALTER TABLE mdata.vendors ADD CONSTRAINT uq_vendors_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- 3) same-entity composite FK (only if items already carries operating_company_id from AF-2).
--    RI checks bypass RLS, so this validates against the vendor master regardless of the app GUC.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='items' AND column_name='operating_company_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname='items_preferred_vendor_same_entity_fkey' AND conrelid='catalogs.items'::regclass) THEN
      ALTER TABLE catalogs.items ADD CONSTRAINT items_preferred_vendor_same_entity_fkey
        FOREIGN KEY (operating_company_id, preferred_vendor_id)
        REFERENCES mdata.vendors (operating_company_id, id);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_preferred_vendor_id ON catalogs.items (preferred_vendor_id);

-- No RLS/grant change: catalogs.items entity RLS + ih35_app grants are already in place (AF-2); FK checks
-- bypass RLS. mdata.vendors grants are unchanged (REFERENCES is only needed to CREATE the FK, done here).

COMMIT;
