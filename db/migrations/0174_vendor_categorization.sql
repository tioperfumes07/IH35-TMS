-- P7 — Vendor categorization on mdata.vendors (additive).
-- Neon production: run the block below verbatim in a transaction if applying manually.
--
-- NEON PRODUCTION BLOCK (copy-paste):
-- BEGIN;
-- DO $$
-- BEGIN
--   IF to_regclass('mdata.vendors') IS NOT NULL THEN
--     IF NOT EXISTS (
--       SELECT 1 FROM information_schema.columns
--       WHERE table_schema = 'mdata' AND table_name = 'vendors' AND column_name = 'vendor_category'
--     ) THEN
--       ALTER TABLE mdata.vendors ADD COLUMN vendor_category text NULL;
--     END IF;
--     IF NOT EXISTS (
--       SELECT 1 FROM information_schema.columns
--       WHERE table_schema = 'mdata' AND table_name = 'vendors' AND column_name = 'vendor_category_locked_at'
--     ) THEN
--       ALTER TABLE mdata.vendors ADD COLUMN vendor_category_locked_at timestamptz NULL;
--     END IF;
--   END IF;
-- END $$;
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_vendor_category_chk') THEN
--     IF to_regclass('mdata.vendors') IS NOT NULL THEN
--       ALTER TABLE mdata.vendors
--         ADD CONSTRAINT vendors_vendor_category_chk
--         CHECK (
--           vendor_category IS NULL OR vendor_category IN (
--             'diesel','def','repairs_maintenance','road_service','meals_entertainment','driver','washout','lumpers','insurance','tolls','parking','permits','taxes','professional_services','utilities','rent','office_supplies','software','other'
--           )
--         );
--     END IF;
--   END IF;
-- END $$;
-- CREATE INDEX IF NOT EXISTS idx_vendors_category ON mdata.vendors (operating_company_id, vendor_category) WHERE vendor_category IS NOT NULL;
-- COMMIT;

BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.vendors') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'mdata'
        AND table_name = 'vendors'
        AND column_name = 'vendor_category'
    ) THEN
      ALTER TABLE mdata.vendors ADD COLUMN vendor_category text NULL;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'mdata'
        AND table_name = 'vendors'
        AND column_name = 'vendor_category_locked_at'
    ) THEN
      ALTER TABLE mdata.vendors ADD COLUMN vendor_category_locked_at timestamptz NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_vendor_category_chk') THEN
    IF to_regclass('mdata.vendors') IS NOT NULL THEN
      ALTER TABLE mdata.vendors
        ADD CONSTRAINT vendors_vendor_category_chk
        CHECK (
          vendor_category IS NULL OR vendor_category IN (
            'diesel',
            'def',
            'repairs_maintenance',
            'road_service',
            'meals_entertainment',
            'driver',
            'washout',
            'lumpers',
            'insurance',
            'tolls',
            'parking',
            'permits',
            'taxes',
            'professional_services',
            'utilities',
            'rent',
            'office_supplies',
            'software',
            'other'
          )
        );
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_category ON mdata.vendors (operating_company_id, vendor_category)
  WHERE vendor_category IS NOT NULL;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'mdata'
  AND table_name = 'vendors'
  AND column_name IN ('vendor_category', 'vendor_category_locked_at')
ORDER BY column_name;

COMMIT;
