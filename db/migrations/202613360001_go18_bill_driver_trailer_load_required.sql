-- 202613360001_go18_bill_driver_trailer_load_required.sql
-- GO-18 (design docs/lockdown/GO-18-LOAD-COSTS-DESIGN.md §3.5, CC-1 seat item) — "Expense path already
-- has load, vendor, driver, truck, trailer. Bill path must catch up (driver + trailer on header;
-- load_required on lines)."
--
-- Live-verified gap (2026-09-01, information_schema): accounting.bills has unit_id but NO driver_id/
-- trailer_id (accounting.expenses has driver_uuid/unit_id/trailer_id — expenses_trailer_id_fkey ->
-- mdata.equipment(id) ON DELETE SET NULL). accounting.bill_lines has load_id but NO load_required/
-- load_exemption_reason/line_category (accounting.expense_lines has all three, enforced by the
-- shared trigger accounting.enforce_load_fk_invariant() -- G18 invariant, board finding 2026-08-16).
--
-- Additive only, idempotent, no backfill (every existing bill/bill_line predates this column and
-- defaults correctly: driver_id/trailer_id NULL = "not linked", load_required false = unchanged
-- behavior for every historical row -- matches expense_lines' own original rollout, which also did
-- not backfill line_category on 34,001 pre-existing rows per that finding's own text).

-- 1. accounting.bills header columns -- parity with accounting.expenses.
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS driver_id uuid;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS trailer_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_driver_id_fkey'
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_trailer_id_fkey'
  ) THEN
    -- Mirrors accounting.expenses_trailer_id_fkey exactly: ON DELETE SET NULL, same target table.
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_trailer_id_fkey FOREIGN KEY (trailer_id) REFERENCES mdata.equipment(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bills_driver_id ON accounting.bills (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_trailer_id ON accounting.bills (trailer_id) WHERE trailer_id IS NOT NULL;

-- 2. accounting.bill_lines -- G18 load-linkage invariant columns, same shape as expense_lines.
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS line_category text;
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT false;
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS load_exemption_reason text;

-- 3. Extend the SHARED trigger function (accounting.enforce_load_fk_invariant, migration
-- 0093/202607110210-era) to also branch on accounting.bill_lines exactly like expense_lines --
-- reuse the existing generic function, do not fork a bill-specific copy. fuel.fuel_transactions'
-- branch is preserved byte-for-byte.
CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_required boolean := false;
BEGIN
  IF NEW.load_exemption_reason IS NOT NULL THEN
    IF length(trim(NEW.load_exemption_reason)) < 20 THEN
      RAISE EXCEPTION
        'E_LOAD_EXEMPTION_REASON_TOO_SHORT: load_exemption_reason must be >=20 chars';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME IN ('expense_lines', 'bill_lines') THEN
    v_required := COALESCE(NEW.load_required, false);
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM accounting.line_category_load_required r
        WHERE r.line_category = NEW.line_category
      ) INTO v_required;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
  END IF;

  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_LOAD_FK_REQUIRED: %.% category=% requires load_id (G18 invariant). Provide load_id OR load_exemption_reason >=20 chars.',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      COALESCE(NEW.line_category, 'n/a');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bill_line_load_fk ON accounting.bill_lines;
CREATE TRIGGER trg_bill_line_load_fk
  BEFORE INSERT OR UPDATE ON accounting.bill_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_load_fk_invariant();
