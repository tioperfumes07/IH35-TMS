-- 202613560001_company_settlements_header_table.sql
-- Company settlement (25-task instructions 2026-09-02 #2-4; GO-19 owner decision CLOSED
-- 2026-09-01, docs/lockdown/GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md section 2: "Coders build
-- the table now -- no further owner decision."). Design source: /Users/jorgemunoz/Downloads/
-- Company_Settlement_5753.pdf, read live before writing this schema.
--
-- Grain: per settlement PERIOD (start/end date), covering one or more loads/driver-settlements
-- (5753 covers loads 13471+13480 on ONE driver settlement). "Mirror of driver settlement" --
-- eight sections: header (dates+loads+stops), Customer Charges, Driver Payment, Fuel Purchases,
-- Expenses, Revenue, a P&L rollup (Quick Pay / Driver Salary / Additional Driver Pay / Fuel /
-- Company Expenses / Net Revenue), and Miles+MPG. The formula ties to the cent:
--   8100 (Revenue) - 73.50 (Quick Pay) - 1897.95 (Driver Salary) - 100 (Additional Driver Pay)
--     - 3491.92 (Fuel) - 121.52 (Company Expenses) = 2415.11 (Net Revenue)
--
-- CANONICAL-CHECK: this is a HEADER + LINKAGE table only. It does not duplicate a single cent of
-- financial data -- Customer Charges/Driver Payment/Fuel/Expenses/Revenue are all already real,
-- money-authoritative rows in mdata.loads, driver_finance.settlement_lines, fuel.fuel_transactions
-- and accounting.expenses (via each linked load_id). The 8 sections are COMPUTED at read time by
-- walking company_settlements -> company_settlement_driver_settlements ->
-- driver_finance.driver_settlements -> its settlement_lines' load_ids -> the canonical source
-- tables. This migration exists to give that reconstruction a real anchor (the settlement number,
-- period, close state) and a real FK linkage to the driver settlement(s) it mirrors -- not to
-- create a second, competing money ledger. accounting.expenses / fuel.fuel_transactions /
-- driver_finance.settlement_lines remain the one place each dollar is recorded.
--
-- Number generator: driver_finance.next_settlement_display_id() already exists (advisory-lock
-- protected, ACCT-F19367). This is a DIFFERENT table (accounting.company_settlements, not
-- driver_finance.driver_settlements) so it needs its own series identity -- reusing the same
-- function/sequence would collide two independent document types under one counter. New function
-- follows the IDENTICAL advisory-lock-before-MAX()+1 pattern (never a bare MAX()+1), prefixed
-- "CS-" so a company settlement number is never visually confused with a driver settlement's "S-"
-- number, per the same "one convention, never invent a third" rule GO-22's LOAD/LD note already
-- established for a different series.
--
-- Additive, idempotent, no data touched.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.company_settlements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  display_id            text NOT NULL,
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  status                text NOT NULL DEFAULT 'open',
  closed_at             timestamptz NULL,
  closed_by_user_id     uuid NULL REFERENCES identity.users(id),
  voided_at             timestamptz NULL,
  void_reason           text NULL,
  voided_by_user_id     uuid NULL REFERENCES identity.users(id),
  created_by_user_id    uuid NULL REFERENCES identity.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_settlements_display_id UNIQUE (operating_company_id, display_id),
  CONSTRAINT chk_company_settlements_period CHECK (period_end >= period_start)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_company_settlements_status'
      AND conrelid = 'accounting.company_settlements'::regclass
  ) THEN
    ALTER TABLE accounting.company_settlements
      ADD CONSTRAINT chk_company_settlements_status
      CHECK (status IN ('open', 'closed', 'void'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_company_settlements_company_period
  ON accounting.company_settlements (operating_company_id, period_start DESC);
CREATE INDEX IF NOT EXISTS ix_company_settlements_open
  ON accounting.company_settlements (operating_company_id, status)
  WHERE status = 'open' AND voided_at IS NULL;

-- Task #4: "wire the company settlement to close alongside the driver settlement when the tour
-- closes at the yard. One close, two settlements." This junction is the real FK linkage that
-- makes "one close, two settlements" possible -- confirmPresettlementLink / tour-close never has
-- to guess which loads/dollars belong to a company settlement; it walks this table.
CREATE TABLE IF NOT EXISTS accounting.company_settlement_driver_settlements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_settlement_id  uuid NOT NULL REFERENCES accounting.company_settlements(id),
  driver_settlement_id   uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_settlement_driver_settlement UNIQUE (company_settlement_id, driver_settlement_id),
  -- A driver settlement mirrors into exactly one company settlement -- never double-counted into
  -- two company P&L rollups.
  CONSTRAINT uq_driver_settlement_one_company_settlement UNIQUE (driver_settlement_id)
);

CREATE INDEX IF NOT EXISTS ix_company_settlement_driver_settlements_company
  ON accounting.company_settlement_driver_settlements (company_settlement_id);

-- CS-YYYY-NNNN, advisory-lock protected -- same discipline as ACCT-F19367
-- (driver_finance.next_settlement_display_id), never a bare MAX()+1.
CREATE OR REPLACE FUNCTION accounting.next_company_settlement_display_id(p_operating_company_id uuid, p_period_start date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_year int := EXTRACT(year FROM p_period_start)::int;
  v_next int := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(format('accounting.company_settlement.display_id:%s:%s', p_operating_company_id, v_year)));

  IF to_regclass('accounting.company_settlements') IS NOT NULL THEN
    SELECT COALESCE(
      MAX(
        CASE
          WHEN display_id ~ ('^CS-' || v_year::text || '-[0-9]{4}$')
            THEN right(display_id, 4)::int
          ELSE 0
        END
      ),
      0
    ) + 1
    INTO v_next
    FROM accounting.company_settlements
    WHERE operating_company_id = p_operating_company_id
      AND period_start >= make_date(v_year, 1, 1)
      AND period_start < make_date(v_year + 1, 1, 1);
  END IF;

  RETURN format('CS-%s-%s', v_year, lpad(v_next::text, 4, '0'));
END
$function$;

DO $company_settlement_rls$
BEGIN
  IF to_regclass('accounting.company_settlements') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE accounting.company_settlements ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE accounting.company_settlements FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'accounting' AND tablename = 'company_settlements'
      AND policyname = 'company_settlements_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY company_settlements_tenant ON accounting.company_settlements
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  -- void-not-delete: never DELETE, void via voided_at/void_reason.
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.company_settlements TO ih35_app';
  EXECUTE 'REVOKE DELETE ON accounting.company_settlements FROM ih35_app';
  EXECUTE 'REVOKE ALL ON accounting.company_settlements FROM PUBLIC';
END
$company_settlement_rls$;

DO $company_settlement_junction_rls$
BEGIN
  IF to_regclass('accounting.company_settlement_driver_settlements') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE accounting.company_settlement_driver_settlements ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE accounting.company_settlement_driver_settlements FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'accounting' AND tablename = 'company_settlement_driver_settlements'
      AND policyname = 'company_settlement_driver_settlements_tenant'
  ) THEN
    -- Junction row has no operating_company_id of its own -- scope through the parent header.
    EXECUTE $policy$
      CREATE POLICY company_settlement_driver_settlements_tenant ON accounting.company_settlement_driver_settlements
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR EXISTS (
            SELECT 1 FROM accounting.company_settlements cs
            WHERE cs.id = company_settlement_driver_settlements.company_settlement_id
              AND cs.operating_company_id::text = current_setting('app.operating_company_id', true)
          )
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR EXISTS (
            SELECT 1 FROM accounting.company_settlements cs
            WHERE cs.id = company_settlement_driver_settlements.company_settlement_id
              AND cs.operating_company_id::text = current_setting('app.operating_company_id', true)
          )
        )
    $policy$;
  END IF;
  -- Append-only linkage -- never UPDATE (a driver settlement's company-settlement assignment is
  -- fixed at creation), never DELETE.
  EXECUTE 'GRANT SELECT, INSERT ON accounting.company_settlement_driver_settlements TO ih35_app';
  EXECUTE 'REVOKE UPDATE, DELETE ON accounting.company_settlement_driver_settlements FROM ih35_app';
  EXECUTE 'REVOKE ALL ON accounting.company_settlement_driver_settlements FROM PUBLIC';
END
$company_settlement_junction_rls$;

COMMENT ON TABLE accounting.company_settlements IS
  'Company settlement header (25-task #2-4; GO-19 owner decision CLOSED 2026-09-01). Per-PERIOD grain, mirrors one or more driver settlements. The 8 sections (Customer Charges/Driver Payment/Fuel/Expenses/Revenue/P&L rollup/Miles+MPG) are computed at read time from the linked driver settlements'' own canonical source tables -- this table stores no duplicated dollar amounts, only the header + close state.';
COMMENT ON TABLE accounting.company_settlement_driver_settlements IS
  'Links a company settlement to the driver settlement(s) it mirrors. A driver settlement belongs to exactly one company settlement (uq_driver_settlement_one_company_settlement). Append-only -- never updated or deleted.';
COMMENT ON FUNCTION accounting.next_company_settlement_display_id IS
  'CS-YYYY-NNNN, per (operating_company_id, year), advisory-lock serialized before MAX()+1 -- same discipline as driver_finance.next_settlement_display_id (ACCT-F19367). Never a bare MAX()+1.';

COMMIT;
