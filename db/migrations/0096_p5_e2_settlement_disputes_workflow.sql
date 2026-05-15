BEGIN;

CREATE SCHEMA IF NOT EXISTS driver_finance;

-- Self-heal forward-dep: driver_finance.driver_settlements introduced in migration 0124, guarded here for fresh-DB compatibility.

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping driver_finance.driver_settlement_disputes: driver_finance.driver_settlements missing';
  ELSE
    CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_disputes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id uuid NOT NULL REFERENCES org.companies(id),
      settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
      driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
      dispute_category text NOT NULL CHECK (dispute_category IN (
        'missing_pay', 'wrong_deduction', 'miscalculated_mileage',
        'wrong_rate', 'detention_not_paid', 'cash_advance_dispute',
        'fine_dispute', 'escrow_dispute', 'other'
      )),
      dispute_description text NOT NULL CHECK (length(trim(dispute_description)) >= 20),
      disputed_amount_cents bigint,
      status text NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'under_review', 'resolved_in_favor', 'resolved_rejected',
        'partially_resolved', 'withdrawn'
      )),
      opened_by_driver boolean NOT NULL DEFAULT true,
      opened_by_user_id uuid REFERENCES identity.users(id),
      opened_at timestamptz NOT NULL DEFAULT now(),
      reviewed_by_user_id uuid REFERENCES identity.users(id),
      reviewed_at timestamptz,
      resolution_notes text,
      resolution_amount_cents bigint,
      resolution_journal_entry_id uuid,
      closed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE driver_finance.driver_settlement_disputes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS rls_settlement_disputes_isolation ON driver_finance.driver_settlement_disputes;
    CREATE POLICY rls_settlement_disputes_isolation
      ON driver_finance.driver_settlement_disputes
      FOR ALL TO ih35_app
      USING (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      )
      WITH CHECK (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      );

    CREATE INDEX IF NOT EXISTS idx_dispute_settlement
      ON driver_finance.driver_settlement_disputes (settlement_id);
    CREATE INDEX IF NOT EXISTS idx_dispute_driver_status
      ON driver_finance.driver_settlement_disputes (driver_id, status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dispute_company_open
      ON driver_finance.driver_settlement_disputes (operating_company_id, status, opened_at DESC)
      WHERE status IN ('open', 'under_review');
  END IF;
END
$$;

COMMIT;
