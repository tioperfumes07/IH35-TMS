-- SAFE-1 — Accident "At Fault" + DOT "Preventable" determination (make the dead control functional)
-- =================================================================================================
-- CONTEXT: The office AccidentReportDrawer exposes an "At Fault" control, but it was a DEAD STUB —
-- the value was hardcoded to "no" with a no-op onChange, and `safety.accident_reports` had no column
-- to store it (base table 0049 = id/operating_company_id/driver_id/accident_at/description; SC1
-- migration 202607031500 added unit_id/vendor_id/load_id only). This migration adds the two columns
-- needed to make the control real and persistable:
--   • at_fault    — carrier fault determination (yes / no / disputed), mirrors the three UI options.
--                   NULL = not yet assessed (a fresh report is undetermined, never a false "no").
--   • preventable — DOT / FMCSA preventability determination. This is a DISTINCT concept from fault:
--                   under the FMCSA Crash Preventability Determination Program (CPDP) a crash can be
--                   not-at-fault yet preventable (or vice-versa), and preventability — not fault —
--                   drives the CSA Crash Indicator BASIC. Stored as a nullable boolean:
--                   true = Preventable, false = Not Preventable, NULL = Undetermined / not yet decided.
--
-- NON-FINANCIAL: additive schema only. No GL/money/posting. No DELETE, no UPDATE of existing rows, no
-- data backfill — pure ADD COLUMN. void-not-delete respected (nothing is destructive here).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + guarded CHECK-constraint creation (skip if the constraint
-- already exists). Safe to re-run; a no-op where prod-drift already added a column/constraint. The
-- at_fault CHECK is added NOT VALID so the migration cannot fail on any pre-existing drift rows — new
-- writes are still fully checked; existing rows (near-empty table) are left unvalidated by design.
--
-- GRANTS: new COLUMNS on the already-granted `safety.accident_reports` table are auto-covered by the
-- existing table-level GRANT (migration 0065 grants SELECT/INSERT/UPDATE on schema `safety` to
-- ih35_app; Postgres table grants apply to all columns, including columns added later). No new GRANT
-- needed — this adds columns, not a table or schema.
-- =================================================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('safety.accident_reports') IS NOT NULL THEN
    ALTER TABLE safety.accident_reports
      ADD COLUMN IF NOT EXISTS at_fault    text,
      ADD COLUMN IF NOT EXISTS preventable boolean;

    -- Constrain at_fault to the three real UI states (NULL = not yet assessed). NOT VALID so any
    -- pre-existing drift row cannot block the migration; all NEW writes are checked.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_accident_reports_at_fault'
        AND conrelid = 'safety.accident_reports'::regclass
    ) THEN
      ALTER TABLE safety.accident_reports
        ADD CONSTRAINT chk_accident_reports_at_fault
        CHECK (at_fault IS NULL OR at_fault IN ('yes','no','disputed'))
        NOT VALID;
    END IF;
  END IF;
END
$$;

COMMIT;
