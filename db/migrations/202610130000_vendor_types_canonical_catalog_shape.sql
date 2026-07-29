-- LST-WIRE-04 — give catalogs.vendor_types the canonical catalog shape so it can be operator-managed.
--
-- THE DEFECT (verified live on prod 2026-07-29, complete read: visible 24 == n_live_tup 24):
-- catalogs.vendor_types holds 8 vendor types per entity across all three companies, entity-scoped with
-- FORCE RLS — and NOTHING in the backend reads it. Not one query. The vendor-type picker is instead a
-- HARDCODED TypeScript union in apps/frontend/src/api/mdata.ts:
--     vendor_type: "Fuel" | "Repair" | "Tires" | "Towing" | "Insurance" | "Permit" | "Toll" | "Other"
-- with a matching frozen array in VendorCreateModal.tsx.
--
-- So the owner can SELECT a vendor type but can never add, rename or retire one: a new row in this
-- table would not appear in the picker, and the union would reject it anyway. Per-entity vendor types
-- are impossible even though the table is entity-scoped. The two lists agree today only because the
-- table was seeded to match the hardcoded values — nothing keeps them in sync.
--
-- WHY A MIGRATION IS NEEDED AT ALL: this is the one catalog in the wiring batch whose shape is not
-- canonical. It uses vendor_type_name / vendor_type_code and has no sort_order, so the generic catalog
-- factory (which reads code / display_name / sort_order) cannot serve it. Wiring it without this
-- migration would 500 on first use.
--
-- ADDITIVE ONLY. No column is dropped or renamed; vendor_type_name and vendor_type_code stay exactly
-- as they are, so any future reader of the legacy names keeps working. The new columns are kept in
-- lockstep with the legacy ones by a trigger (below) so the two can never diverge — the split-brain
-- this repo has been burned by.

DO $$
BEGIN
  IF to_regclass('catalogs.vendor_types') IS NULL THEN
    RAISE NOTICE 'LST-WIRE-04: catalogs.vendor_types absent (unprovisioned database) — skipping';
    RETURN;
  END IF;

  ALTER TABLE catalogs.vendor_types ADD COLUMN IF NOT EXISTS code text;
  ALTER TABLE catalogs.vendor_types ADD COLUMN IF NOT EXISTS display_name text;
  ALTER TABLE catalogs.vendor_types ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

  -- Backfill from the legacy columns. code is derived from vendor_type_code when present, else from
  -- the name, upper-cased and underscored to match the catalog code convention (^[A-Z][A-Z0-9_-]+$).
  UPDATE catalogs.vendor_types
     SET display_name = COALESCE(display_name, vendor_type_name),
         code = COALESCE(
           code,
           NULLIF(upper(regexp_replace(COALESCE(vendor_type_code, vendor_type_name), '[^a-zA-Z0-9]+', '_', 'g')), '')
         )
   WHERE display_name IS NULL OR code IS NULL;
END
$$;

-- Uniqueness per entity on the new code, matching every other catalog. Partial so historical rows with
-- a NULL code (there should be none after the backfill) cannot block the index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_types_company_code
  ON catalogs.vendor_types (operating_company_id, code)
  WHERE code IS NOT NULL;

-- Keep legacy and canonical columns in lockstep IN BOTH DIRECTIONS.
--
-- Without this, the factory writes display_name while older code paths read vendor_type_name, and the
-- two drift apart silently — one screen showing "Fuel" and another showing whatever it was renamed to.
-- A generated column was rejected deliberately: GENERATED ALWAYS columns are not writable, so the
-- factory's edit path would fail on every update.
CREATE OR REPLACE FUNCTION catalogs.vendor_types_sync_canonical()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Whichever side the caller supplied, mirror it to the other.
  IF NEW.display_name IS DISTINCT FROM OLD.display_name AND NEW.display_name IS NOT NULL THEN
    NEW.vendor_type_name := NEW.display_name;
  ELSIF NEW.vendor_type_name IS DISTINCT FROM OLD.vendor_type_name AND NEW.vendor_type_name IS NOT NULL THEN
    NEW.display_name := NEW.vendor_type_name;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.display_name := COALESCE(NEW.display_name, NEW.vendor_type_name);
    NEW.vendor_type_name := COALESCE(NEW.vendor_type_name, NEW.display_name);
    NEW.code := COALESCE(
      NEW.code,
      NULLIF(upper(regexp_replace(COALESCE(NEW.vendor_type_code, NEW.vendor_type_name), '[^a-zA-Z0-9]+', '_', 'g')), '')
    );
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_vendor_types_sync_canonical ON catalogs.vendor_types;
CREATE TRIGGER trg_vendor_types_sync_canonical
  BEFORE INSERT OR UPDATE ON catalogs.vendor_types
  FOR EACH ROW EXECUTE FUNCTION catalogs.vendor_types_sync_canonical();

-- Runtime role needs the new objects (migration 0065 + DEFAULT PRIVILEGES pattern).
GRANT SELECT, INSERT, UPDATE ON catalogs.vendor_types TO ih35_app;
