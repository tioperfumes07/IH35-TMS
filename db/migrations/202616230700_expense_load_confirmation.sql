-- 202616230700_expense_load_confirmation.sql
-- CC-2 · OWNER RULING 443.288 (10-23-2026 7:59 PM CT): "when setting on a load an expense, the dispatcher or closer
-- whatever must confirm them. always. i dont want to rely in a system that constantly fails."
--   accounting.expenses.load_confirmation  'proposed' (a machine decided the load) | 'confirmed' (a person decided it);
--                                          NULL when the expense has no load.
--   load_proposal_evidence                 the engine's evidence (truck at the pump, GPS distance, minutes off, load
--                                          running / next, the previous confirmation when a machine moved it again).
--   load_confirmed_by_user_id / load_confirmed_at   who confirmed, when.
-- ONE rule, enforced here so no writer can skip it (trigger accounting.expense_load_confirmation_rule):
--   * any INSERT with a load, or any change of load_id / load_confirmation, becomes 'proposed' (by / at cleared) —
--     UNLESS the transaction carries app.expense_load_confirm_actor = <user uuid>, which only THE confirm engine and the
--     person-chosen writers set (set_config local): then it is 'confirmed' by that person, now.
--   * a 'confirmed' expense a machine later moves becomes 'proposed' again and its evidence keeps the previous
--     confirmation (rule 4: a machine re-attribution is a new proposal the person confirms).
--   * no load -> confirmation columns cleared.
-- Backfill (ruling item 6): expenses with a load on a CLOSED settlement (trip_closed_at set, live) = confirmed at close
-- (by the settlement's poster/approver when recorded, at trip_closed_at); every other expense with a load = proposed.
-- A child (parent_expense_id, 443.288-A) takes its parent's state. Idempotent. No amount, account, load or GL changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('app.bypass_rls', 'lucia', true);

ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS load_confirmation text;
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS load_proposal_evidence jsonb;
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS load_confirmed_by_user_id uuid;
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS load_confirmed_at timestamptz;
COMMENT ON COLUMN accounting.expenses.load_confirmation IS 'OWNER RULING 443.288: proposed (a machine decided the load) | confirmed (a dispatcher, the closer or the owner decided it). Only the confirm engine / person-chosen writers write confirmed (trigger expense_load_confirmation_rule). NULL = no load.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_load_confirmed_by_user_fkey' AND conrelid = 'accounting.expenses'::regclass) THEN
    ALTER TABLE accounting.expenses ADD CONSTRAINT expenses_load_confirmed_by_user_fkey
      FOREIGN KEY (load_confirmed_by_user_id) REFERENCES identity.users (id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_load_confirmation_values' AND conrelid = 'accounting.expenses'::regclass) THEN
    ALTER TABLE accounting.expenses ADD CONSTRAINT expenses_load_confirmation_values
      CHECK (load_confirmation IS NULL OR load_confirmation IN ('proposed', 'confirmed')) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION accounting.expense_load_confirmation_rule()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_actor text := NULLIF(current_setting('app.expense_load_confirm_actor', true), '');
BEGIN
  -- the one-time backfill below writes explicit values
  IF current_setting('app.expense_load_confirm_backfill', true) = '443.288-B' THEN RETURN NEW; END IF;
  IF NEW.load_id IS NULL THEN
    NEW.load_confirmation := NULL; NEW.load_confirmed_by_user_id := NULL; NEW.load_confirmed_at := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.load_id IS NOT DISTINCT FROM OLD.load_id
     AND NEW.load_confirmation IS NOT DISTINCT FROM OLD.load_confirmation
     AND NEW.load_confirmed_by_user_id IS NOT DISTINCT FROM OLD.load_confirmed_by_user_id
     AND NEW.load_confirmed_at IS NOT DISTINCT FROM OLD.load_confirmed_at THEN
    RETURN NEW; -- nothing about the load changed
  END IF;
  IF v_actor ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    NEW.load_confirmation := 'confirmed';
    NEW.load_confirmed_by_user_id := v_actor::uuid;
    NEW.load_confirmed_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.load_confirmation = 'confirmed' AND NEW.load_id IS DISTINCT FROM OLD.load_id THEN
    NEW.load_proposal_evidence := COALESCE(NEW.load_proposal_evidence, '{}'::jsonb) || jsonb_build_object(
      'previously_confirmed_load_id', OLD.load_id, 'previously_confirmed_by_user_id', OLD.load_confirmed_by_user_id,
      'previously_confirmed_at', OLD.load_confirmed_at, 'moved_by_machine_at', now());
  END IF;
  NEW.load_confirmation := 'proposed';
  NEW.load_confirmed_by_user_id := NULL;
  NEW.load_confirmed_at := NULL;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_expense_load_confirmation_rule ON accounting.expenses;
CREATE TRIGGER trg_expense_load_confirmation_rule
  BEFORE INSERT OR UPDATE OF load_id, load_confirmation, load_confirmed_by_user_id, load_confirmed_at ON accounting.expenses
  FOR EACH ROW EXECUTE FUNCTION accounting.expense_load_confirmation_rule();

CREATE INDEX IF NOT EXISTS ix_expenses_load_proposed
  ON accounting.expenses (operating_company_id, load_id) WHERE load_confirmation = 'proposed' AND voided_at IS NULL;

-- ── Backfill ──────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT set_config('app.expense_load_confirm_backfill', '443.288-B', true);

WITH closed AS (
  SELECT DISTINCT ON (sl.load_id, s.operating_company_id)
         sl.load_id, s.operating_company_id, s.id AS settlement_id, s.trip_closed_at,
         COALESCE(s.posted_by_user_id, s.approved_by) AS closer
    FROM driver_finance.driver_settlements s
    JOIN driver_finance.settlement_lines sl ON sl.settlement_id = s.id AND sl.operating_company_id = s.operating_company_id
   WHERE s.trip_closed_at IS NOT NULL AND s.voided_at IS NULL AND s.reversed_at IS NULL
     AND s.status NOT IN ('cancelled', 'void', 'voided') AND sl.is_active = true AND sl.voided_at IS NULL
     AND sl.load_id IS NOT NULL
   ORDER BY sl.load_id, s.operating_company_id, s.trip_closed_at
)
UPDATE accounting.expenses e
   SET load_confirmation = 'confirmed',
       load_confirmed_by_user_id = c.closer,
       load_confirmed_at = c.trip_closed_at,
       load_proposal_evidence = COALESCE(e.load_proposal_evidence, '{}'::jsonb)
         || jsonb_build_object('confirmed_at_close', true, 'settlement_id', c.settlement_id, 'backfill', '443.288-B')
  FROM closed c
 WHERE e.load_id = c.load_id AND e.operating_company_id = c.operating_company_id AND e.load_confirmation IS NULL;

UPDATE accounting.expenses e
   SET load_confirmation = 'proposed',
       load_proposal_evidence = COALESCE(e.load_proposal_evidence, '{}'::jsonb) || jsonb_build_object('backfill', '443.288-B')
 WHERE e.load_id IS NOT NULL AND e.load_confirmation IS NULL;

-- a child takes its parent's state (it never has its own load decision)
UPDATE accounting.expenses c
   SET load_confirmation = p.load_confirmation, load_confirmed_by_user_id = p.load_confirmed_by_user_id,
       load_confirmed_at = p.load_confirmed_at
  FROM accounting.expenses p
 WHERE c.parent_expense_id = p.id AND c.operating_company_id = p.operating_company_id AND c.load_id IS NOT NULL
   AND c.load_confirmation IS DISTINCT FROM p.load_confirmation;

SELECT set_config('app.expense_load_confirm_backfill', '', true);
ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_load_confirmation_values;
ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_load_confirmed_by_user_fkey;

DO $$
DECLARE v_c int; v_p int;
BEGIN
  SELECT count(*) FILTER (WHERE load_confirmation = 'confirmed'), count(*) FILTER (WHERE load_confirmation = 'proposed')
    INTO v_c, v_p FROM accounting.expenses WHERE voided_at IS NULL;
  RAISE NOTICE '443.288-B expense load confirmation: % confirmed (closed settlements), % proposed', v_c, v_p;
END $$;
COMMIT;
