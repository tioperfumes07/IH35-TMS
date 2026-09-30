-- 202614980000_tier1_linkage_unit_driver_constraint.sql
-- ROUND 300 A-31 (Lead order): "Tier 1 gets a deferrable constraint trigger, same shape as B-26's
-- lineless-invoice trigger, so a fuel row with no unit cannot exist even if every guard is
-- bypassed. DO NOT retro-fail the 52 existing rows -- the trigger is going-forward, and L-3 repairs
-- the past." (L-3's 52 fuel rows were separately repaired same-day, PR #23503/AUTH-178.)
--
-- docs/laws/TRANSACTION-LINKAGE-LAW.md TIER1 ("a truck that is working") requires unit AND driver
-- AND load, no exceptions. scripts/verify-transaction-linkage-law.mjs (A-30, merged) is the CI
-- guard that stops the next commit. A guard only sees code; this migration is the second half --
-- it stops a row written by hand, by a script, or by an integration, exactly the same reasoning
-- B-26 used for "a lineless invoice header impossible AT THE TABLE."
--
-- SCOPE: this trigger enforces ONLY the unit_id + driver_id dimensions -- NOT load_id.
-- accounting.enforce_load_fk_invariant() (migration 0093, "G18") already enforces load_id (or a
-- documented load_exemption_reason) on accounting.expense_lines (for the 9 categories in
-- accounting.line_category_load_required) and unconditionally on fuel.fuel_transactions. That
-- trigger is live, deliberate, pre-existing infrastructure; this migration does not touch it and
-- does not duplicate its load check. The ONE place this migration DOES enforce load_id is
-- maintenance.work_orders, because no prior trigger touches that table's load linkage at all.
--
-- WHY A SEPARATE FUNCTION FROM G18's, NOT AN EXTENSION OF IT: G18's function
-- (accounting.enforce_load_fk_invariant) is a plain BEFORE INSERT OR UPDATE trigger with its own
-- reason-escape-hatch semantics tied specifically to the load dimension. Interleaving a second,
-- unrelated dimension (unit/driver, no escape hatch, AFTER INSERT only per the Lead's "going-
-- forward only" instruction) into that function would make ONE function do two different jobs with
-- two different firing times and two different exception policies -- harder to reason about, and
-- riskier to touch given G18's own history (LV-G18-INERT-ON-EXPENSE-LINES, a real incident). A
-- second, purpose-built, additive function is the same shape B-26 used relative to every other
-- table's own constraints.
--
-- WHY DEFERRABLE INITIALLY DEFERRED, AFTER INSERT ONLY, NEVER UPDATE (identical reasoning to B-26):
--   (a) AFTER INSERT only -- stops the NEXT bad row; does not retroactively enforce on any existing
--       row, and does not fire on a later UPDATE (so an existing row transitioning status, e.g. to
--       'voided'/'cancelled', is never touched by this trigger).
--   (b) DEFERRABLE INITIALLY DEFERRED -- fires at COMMIT. A row on fuel.fuel_transactions or
--       accounting.expense_lines may be inserted before its unit/driver assignment is resolved
--       later in the SAME transaction (mirrors G18's own multi-statement-transaction accommodation).
--   (c) WHEN clauses exclude already-voided/cancelled rows at insert time (defensive; going forward
--       nothing is normally created pre-voided, same reasoning as B-26's WHEN (NEW.voided_at IS
--       NULL)). accounting.expense_lines has no voided_at column of its own (voiding lives on the
--       parent accounting.expenses header) so its trigger has no WHEN guard -- there is nothing on
--       the line row itself to exempt.
--
-- DESIGN, live-verified in a throwaway rolled-back transaction before this file was written (see
-- OUTBOX-CC-1.md for the exact session log): a fuel_transactions insert with unit_id NULL is
-- correctly refused; a work_orders insert with source_type='AC' and driver_id NULL is correctly
-- refused; a work_orders insert with source_type='IS' (TIER2) and no unit_id is correctly ALLOWED
-- (this trigger must never fire for TIER2 rows -- the law is explicit that demanding load/driver
-- there is itself the defect, and this migration extends that same discipline to unit/driver: TIER2
-- and TIER3 rows are entirely untouched by this trigger); a legitimate TIER1 insert with all three
-- fields commits clean. All three checks ran inside a transaction that was rolled back -- no data
-- was written by that verification.
--
-- Additive, idempotent (guarded by pg_trigger existence checks), CREATE-only. No existing data
-- touched.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.enforce_tier1_unit_driver_invariant() RETURNS trigger AS $$
DECLARE
  v_tier1 boolean := false;
  v_enforce_load boolean := false;
  v_context text := 'n/a';
BEGIN
  IF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_tier1 := true;
    v_context := 'fuel_transactions';
  ELSIF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME = 'expense_lines' THEN
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM accounting.line_category_load_required r WHERE r.line_category = NEW.line_category
      ) INTO v_tier1;
    END IF;
    v_context := COALESCE(NEW.line_category, 'n/a');
  ELSIF TG_TABLE_SCHEMA = 'maintenance' AND TG_TABLE_NAME = 'work_orders' THEN
    v_tier1 := NEW.source_type IN ('AC', 'RS', 'RT', 'ET');
    v_enforce_load := v_tier1;
    v_context := COALESCE(NEW.source_type, 'n/a');
  END IF;

  IF NOT v_tier1 THEN
    RETURN NULL;
  END IF;

  IF NEW.unit_id IS NULL THEN
    RAISE EXCEPTION
      'E_TIER1_UNIT_REQUIRED: %.% (%) is TIER1 under docs/laws/TRANSACTION-LINKAGE-LAW.md -- a truck that is working requires a unit. NULL is a missing link, not an optional field.',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, v_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.driver_id IS NULL THEN
    RAISE EXCEPTION
      'E_TIER1_DRIVER_REQUIRED: %.% (%) is TIER1 under docs/laws/TRANSACTION-LINKAGE-LAW.md -- a truck that is working requires a driver. NULL is a missing link, not an optional field.',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, v_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_enforce_load AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_TIER1_LOAD_REQUIRED: %.% (%) is TIER1 under docs/laws/TRANSACTION-LINKAGE-LAW.md -- a truck that is working requires a load. NULL is a missing link, not an optional field.',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, v_context
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_tier1_unit_driver_fuel_transactions'
      AND tgrelid = 'fuel.fuel_transactions'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_tier1_unit_driver_fuel_transactions
      AFTER INSERT ON fuel.fuel_transactions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (NEW.voided_at IS NULL)
      EXECUTE FUNCTION accounting.enforce_tier1_unit_driver_invariant();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_tier1_unit_driver_expense_lines'
      AND tgrelid = 'accounting.expense_lines'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_tier1_unit_driver_expense_lines
      AFTER INSERT ON accounting.expense_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION accounting.enforce_tier1_unit_driver_invariant();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_tier1_unit_driver_load_work_orders'
      AND tgrelid = 'maintenance.work_orders'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_tier1_unit_driver_load_work_orders
      AFTER INSERT ON maintenance.work_orders
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (NEW.status IS DISTINCT FROM 'voided')
      EXECUTE FUNCTION accounting.enforce_tier1_unit_driver_invariant();
  END IF;
END $$;

COMMIT;
