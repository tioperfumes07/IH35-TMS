-- CLOSURE-5 P5-T13 — structured settlement dispute workflow (additive).
BEGIN;

CREATE SCHEMA IF NOT EXISTS settlements;

CREATE TABLE IF NOT EXISTS settlements.settlement_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  dispute_type text NOT NULL CHECK (
    dispute_type IN ('missing_line', 'incorrect_rate', 'duplicate_deduction', 'wrong_unit', 'other')
  ),
  claimed_amount_cents bigint NOT NULL CHECK (claimed_amount_cents > 0),
  description text NOT NULL CHECK (length(trim(description)) >= 10),
  evidence_doc_ids uuid[],
  status text NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'in_review', 'approved', 'denied', 'partial')
  ),
  resolution_amount_cents bigint,
  resolution_notes text,
  reviewed_by_user_id uuid REFERENCES identity.users(id),
  reviewed_at timestamptz,
  qbo_adjustment_je_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_settlements_disputes_settlement
  ON settlements.settlement_disputes (settlement_id);

CREATE INDEX IF NOT EXISTS ix_settlements_disputes_open
  ON settlements.settlement_disputes (status, created_at DESC)
  WHERE status IN ('submitted', 'in_review');

ALTER TABLE settlements.settlement_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlements_disputes_tenant_scope ON settlements.settlement_disputes;
CREATE POLICY settlements_disputes_tenant_scope
  ON settlements.settlement_disputes
  FOR ALL TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM driver_finance.driver_settlements s
      WHERE s.id = settlement_disputes.settlement_id
        AND s.operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM driver_finance.driver_settlements s
      WHERE s.id = settlement_disputes.settlement_id
        AND s.operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('settlements') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA settlements TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON settlements.settlement_disputes TO ih35_app;
  END IF;
END
$$;

-- Allow supplemental settlement line on dispute approval.
DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE driver_finance.settlement_lines
        DROP CONSTRAINT IF EXISTS settlement_lines_line_type_check;
    $sql$;
    EXECUTE $sql$
      ALTER TABLE driver_finance.settlement_lines
        ADD CONSTRAINT settlement_lines_line_type_check CHECK (
          line_type IN (
            'earnings', 'extra_pay', 'reimbursement', 'deduction', 'advance_recovery',
            'escrow', 'abandonment_chargeback', 'team_split_primary', 'team_split_secondary',
            'auto_deduction', 'dispute_adjustment'
          )
        );
    $sql$;
  END IF;
END
$$;

COMMIT;
