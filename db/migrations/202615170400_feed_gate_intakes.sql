-- 202615170400_feed_gate_intakes.sql
-- FEED GATE ENGINE (Lead, 2026-10-01) — owner law docs/bus/2026-10-01-OWNER-LAW-FEED-GATE-AND-FACTORING-IS-GENERATED.md
-- "When we feed information it must verify full linkage, connectivity, wiring, to correct tables, accounts, AR, AP,
--  customers, vendors, drivers, categories, loads, settlements; correctly stamped with dates. A settlement: all data
--  input settlement by settlement before the next. Applied to the settlement creator, all engines, all feeders."
-- One feed_intake per fed subject (settlement / load / expense / bill / invoice / factoring statement / fuel import /
-- batch grid); one feed_intake_checks row per check per run (WORM history: a re-run appends run_no+1, never edits).
-- A settlement intake cannot open for a driver while another settlement intake of that driver is open or blocked.
-- Additive. RLS forced. Never deleted. CANONICAL-CHECK: driver_finance.* (never payroll.* / settlement.*).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS driver_finance.feed_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  feed_kind text NOT NULL CHECK (feed_kind IN ('settlement','load','expense','bill','invoice','factoring_statement','fuel_import','batch')),
  subject_table text NOT NULL,
  subject_id uuid NOT NULL,
  driver_id uuid REFERENCES mdata.drivers(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','passed','blocked','closed','voided')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id uuid REFERENCES identity.users(id),
  last_run_no integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  checks_total integer NOT NULL DEFAULT 0,
  checks_failed integer NOT NULL DEFAULT 0,
  passed_at timestamptz,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  void_reason text,
  voided_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_intakes_settlement_has_driver CHECK (feed_kind <> 'settlement' OR driver_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_intakes_live_subject
  ON driver_finance.feed_intakes (operating_company_id, feed_kind, subject_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_feed_intakes_driver_status ON driver_finance.feed_intakes (operating_company_id, driver_id, status) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS driver_finance.feed_intake_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  intake_id uuid NOT NULL REFERENCES driver_finance.feed_intakes(id),
  run_no integer NOT NULL,
  check_group text NOT NULL,
  check_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass','fail','na')),
  subject_table text,
  subject_id uuid,
  subject_label text,
  missing text,
  fix_link text,
  measured jsonb NOT NULL DEFAULT '{}'::jsonb,
  measured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_feed_intake_checks_intake_run ON driver_finance.feed_intake_checks (intake_id, run_no, status);

ALTER TABLE driver_finance.feed_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.feed_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.feed_intake_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.feed_intake_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feed_intakes_company_isolation ON driver_finance.feed_intakes;
CREATE POLICY feed_intakes_company_isolation ON driver_finance.feed_intakes
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
DROP POLICY IF EXISTS feed_intake_checks_company_isolation ON driver_finance.feed_intake_checks;
CREATE POLICY feed_intake_checks_company_isolation ON driver_finance.feed_intake_checks
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON driver_finance.feed_intakes TO ih35_app;
GRANT SELECT, INSERT ON driver_finance.feed_intake_checks TO ih35_app;

CREATE OR REPLACE FUNCTION driver_finance.fn_feed_intake_checks_worm() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'feed_intake_checks is append-only (WORM): re-run the intake to append run %', COALESCE(OLD.run_no, 0) + 1
    USING ERRCODE = 'check_violation';
END; $$;
DROP TRIGGER IF EXISTS trg_feed_intake_checks_worm ON driver_finance.feed_intake_checks;
CREATE TRIGGER trg_feed_intake_checks_worm BEFORE UPDATE OR DELETE ON driver_finance.feed_intake_checks
  FOR EACH ROW EXECUTE FUNCTION driver_finance.fn_feed_intake_checks_worm();
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON driver_finance.feed_intakes;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON driver_finance.feed_intakes
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

CREATE OR REPLACE FUNCTION driver_finance.fn_feed_intake_one_settlement_at_a_time() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE other_id uuid; other_status text;
BEGIN
  IF NEW.feed_kind = 'settlement' AND NEW.voided_at IS NULL AND NEW.status IN ('open','blocked') THEN
    SELECT id, status INTO other_id, other_status FROM driver_finance.feed_intakes
     WHERE operating_company_id = NEW.operating_company_id AND feed_kind = 'settlement' AND driver_id = NEW.driver_id
       AND voided_at IS NULL AND status IN ('open','blocked') AND id <> NEW.id
     ORDER BY opened_at LIMIT 1;
    IF other_id IS NOT NULL THEN
      RAISE EXCEPTION 'feed_gate_one_settlement_at_a_time: driver % already has settlement intake % in status % -- finish it (every check green, closed) before the next settlement opens',
        NEW.driver_id, other_id, other_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_feed_intake_one_settlement_at_a_time ON driver_finance.feed_intakes;
CREATE TRIGGER trg_feed_intake_one_settlement_at_a_time BEFORE INSERT OR UPDATE OF status, voided_at ON driver_finance.feed_intakes
  FOR EACH ROW EXECUTE FUNCTION driver_finance.fn_feed_intake_one_settlement_at_a_time();

COMMENT ON TABLE driver_finance.feed_intakes IS 'FEED GATE: one row per fed subject; a subject cannot close while checks_failed > 0; a driver has one settlement intake open at a time.';
COMMENT ON TABLE driver_finance.feed_intake_checks IS 'FEED GATE: one row per check per run (WORM). status pass/fail/na, missing = what is wrong, fix_link = where to fix it.';
COMMIT;
