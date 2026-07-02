-- MD-1/MD-2 (owner decision #7 clone program) — explicit clone-origin markers on masterdata.
-- Section-B prerequisite: masterdata LAYER-2 origin is today an approximate qbo_*_id-presence heuristic
-- (over-refuses a TMS-created row later synced). This adds the EXPLICIT markers so the clone engine can
-- distinguish QBO-cloned rows from TMS-created rows — required before QBO_ENTITY_PUSH_ENABLED is ever on.
--
-- Owner-ruled fork (2026-07-02): clone rows = source_system='qbo' + source='qbo_clone' discriminator, NO
-- ALTER to any existing CHECK (consistent with the accounting source_system convention + the import-program
-- amendment). mdata.customers/vendors have neither column today, so we ADD both:
--   source_system text NOT NULL DEFAULT 'tms'  CHECK (source_system IN ('tms','qbo'))   -- system of record
--   source        text NULL                                                              -- finer discriminator ('qbo_clone')
-- Money-free; ADD-COLUMN + one-time masterdata backfill; idempotent.

ALTER TABLE mdata.customers ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms';
ALTER TABLE mdata.customers ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE mdata.vendors   ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms';
ALTER TABLE mdata.vendors   ADD COLUMN IF NOT EXISTS source text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mdata.customers'::regclass AND conname='mdata_customers_source_system_check') THEN
    ALTER TABLE mdata.customers ADD CONSTRAINT mdata_customers_source_system_check CHECK (source_system IN ('tms','qbo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mdata.vendors'::regclass AND conname='mdata_vendors_source_system_check') THEN
    ALTER TABLE mdata.vendors ADD CONSTRAINT mdata_vendors_source_system_check CHECK (source_system IN ('tms','qbo'));
  END IF;
END
$$;

-- Backfill (DATA on masterdata, not an audit log): a row carrying a qbo id was written by the clone puller
-- → mark it source_system='qbo', source='qbo_clone'. TMS-created rows (no qbo id) keep the 'tms' default.
-- Idempotent (re-running sets the same values).
UPDATE mdata.customers SET source_system='qbo', source='qbo_clone'
  WHERE qbo_customer_id IS NOT NULL AND TRIM(qbo_customer_id) <> '' AND source IS DISTINCT FROM 'qbo_clone';
UPDATE mdata.vendors SET source_system='qbo', source='qbo_clone'
  WHERE qbo_vendor_id IS NOT NULL AND TRIM(qbo_vendor_id) <> '' AND source IS DISTINCT FROM 'qbo_clone';

CREATE INDEX IF NOT EXISTS idx_mdata_customers_source ON mdata.customers (operating_company_id, source);
CREATE INDEX IF NOT EXISTS idx_mdata_vendors_source ON mdata.vendors (operating_company_id, source);
