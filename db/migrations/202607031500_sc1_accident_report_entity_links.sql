-- SC1 — Accident Report entity links (office creator persistence)
-- =================================================================================================
-- CONTEXT: Jorge's decision — accident reports may originate from the driver app, BUT the safety
-- officer / office MUST also be able to CREATE them from the computer (the office AccidentReportDrawer
-- is a real creator, not view-only). The office wizard captures Driver + Unit + Repair Vendor + Load,
-- but `safety.accident_reports` only had `driver_id` — so unit/vendor/load could not persist. This
-- migration adds the three missing link columns + FKs so an office-created accident keys to the real
-- unit, vendor, and load records (DOT accident register 49 CFR 390.15 requires driver + vehicle id;
-- insurance claims require the unit; vendor bill + load claim complete the chain).
--
-- NON-FINANCIAL: additive schema only. No GL/money/posting. No DELETE, no UPDATE of existing rows,
-- no data backfill — pure ADD COLUMN. void-not-delete respected (FKs use ON DELETE SET NULL so
-- removing a referenced unit/vendor/load NULLs the link and never destroys the accident record).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + guarded FK creation (skip if target table absent or the
-- constraint already exists). Safe to re-run; a no-op where prod-drift already added a column. FKs are
-- created NOT VALID so the migration cannot fail on any pre-existing drift rows — new writes are still
-- fully checked; existing rows (near-empty table) are left unvalidated by design.
--
-- GRANTS: new COLUMNS on the already-granted `safety.accident_reports` table are auto-covered by the
-- existing table-level GRANT (migration 0065 grants SELECT/INSERT/UPDATE on schema `safety` to
-- ih35_app; Postgres table grants apply to all columns including columns added later). No new GRANT
-- needed — this adds columns, not a table or schema.
-- =================================================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('safety.accident_reports') IS NOT NULL THEN
    ALTER TABLE safety.accident_reports
      ADD COLUMN IF NOT EXISTS unit_id   uuid,
      ADD COLUMN IF NOT EXISTS vendor_id uuid,
      ADD COLUMN IF NOT EXISTS load_id   uuid;

    -- Unit link → mdata.units(id). (Ownership lives on mdata.units.owner_company_id /
    -- currently_leased_to_company_id — NOT operating_company_id; we FK the PK only.)
    IF to_regclass('mdata.units') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_accident_reports_unit'
           AND conrelid = 'safety.accident_reports'::regclass
       ) THEN
      ALTER TABLE safety.accident_reports
        ADD CONSTRAINT fk_accident_reports_unit
        FOREIGN KEY (unit_id) REFERENCES mdata.units(id)
        ON DELETE SET NULL
        NOT VALID;
    END IF;

    -- Repair vendor link → mdata.vendors(id).
    IF to_regclass('mdata.vendors') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_accident_reports_vendor'
           AND conrelid = 'safety.accident_reports'::regclass
       ) THEN
      ALTER TABLE safety.accident_reports
        ADD CONSTRAINT fk_accident_reports_vendor
        FOREIGN KEY (vendor_id) REFERENCES mdata.vendors(id)
        ON DELETE SET NULL
        NOT VALID;
    END IF;

    -- Load link → mdata.loads(id).
    IF to_regclass('mdata.loads') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_accident_reports_load'
           AND conrelid = 'safety.accident_reports'::regclass
       ) THEN
      ALTER TABLE safety.accident_reports
        ADD CONSTRAINT fk_accident_reports_load
        FOREIGN KEY (load_id) REFERENCES mdata.loads(id)
        ON DELETE SET NULL
        NOT VALID;
    END IF;
  END IF;
END
$$;

COMMIT;
