-- P6-T11185 — Settlement disputes (new table) + team settlement plumbing (additive).
-- NOTE: `mdata.driver_teams` already exists (0037/0097). This migration does NOT recreate it.

BEGIN;

-- ---------------------------------------------------------------------------
-- driver_finance.settlement_disputes (distinct from legacy driver_settlement_disputes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.settlement_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  settlement_id UUID NOT NULL REFERENCES driver_finance.driver_settlements(id),
  settlement_line_id UUID,
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  evidence_r2_paths TEXT[],
  claimed_adjustment_cents BIGINT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','under_review','approved','denied','withdrawn')),
  reviewer_user_id UUID REFERENCES identity.users(id),
  reviewed_at TIMESTAMPTZ,
  resolution_text TEXT,
  adjustment_cents BIGINT,
  adjustment_journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_settlement_disputes_settlement
  ON driver_finance.settlement_disputes(settlement_id);

CREATE INDEX IF NOT EXISTS ix_settlement_disputes_open
  ON driver_finance.settlement_disputes(operating_company_id, submitted_at DESC)
  WHERE status IN ('submitted','under_review');

ALTER TABLE driver_finance.settlement_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_disputes_company_scope ON driver_finance.settlement_disputes;
CREATE POLICY settlement_disputes_company_scope
  ON driver_finance.settlement_disputes
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.settlement_disputes TO ih35_app;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_settlement_disputes ON driver_finance.settlement_disputes;
      CREATE TRIGGER tg_audit_settlement_disputes
      AFTER INSERT OR UPDATE OR DELETE ON driver_finance.settlement_disputes
      FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- driver_finance.driver_bills — allow distinct bill numbers for team splits
-- ---------------------------------------------------------------------------
ALTER TABLE driver_finance.driver_bills DROP CONSTRAINT IF EXISTS driver_bills_bill_number_key;

DROP INDEX IF EXISTS uniq_driver_bills_operating_company_bill_number;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_bills_operating_company_bill_number
  ON driver_finance.driver_bills (operating_company_id, bill_number);

-- ---------------------------------------------------------------------------
-- driver_finance.settlement_lines — additive columns (table may pre-exist outside repo migrations)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES mdata.driver_teams(id)';
    EXECUTE 'ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS source_driver_bill_id uuid REFERENCES driver_finance.driver_bills(id)';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_settlement_lines_source_driver_bill_id ON driver_finance.settlement_lines (source_driver_bill_id) WHERE source_driver_bill_id IS NOT NULL';
  END IF;
END
$$;

COMMIT;
