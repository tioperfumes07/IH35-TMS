-- Roll-forward self-heal (idempotent). Canonical CREATE: 0141_p6_t11172_driver_finance_driver_bills.sql — MUST precede 0156/0158 guarded ALTERs on fresh replay.
BEGIN;

CREATE SCHEMA IF NOT EXISTS driver_finance;

CREATE TABLE IF NOT EXISTS driver_finance.settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements (id) ON DELETE CASCADE,
  line_type text NOT NULL,
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  team_id uuid REFERENCES mdata.driver_teams (id),
  source_driver_bill_id uuid REFERENCES driver_finance.driver_bills (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_lines_line_type_chk_p6_t11186 CHECK (
    line_type IN (
      'earnings',
      'extra_pay',
      'reimbursement',
      'deduction',
      'abandonment_chargeback',
      'team_split_primary',
      'team_split_secondary'
    )
  )
);

CREATE INDEX IF NOT EXISTS ix_settlement_lines_settlement_id ON driver_finance.settlement_lines (settlement_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_settlement_lines_source_driver_bill_id
  ON driver_finance.settlement_lines (source_driver_bill_id)
  WHERE source_driver_bill_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.settlement_lines TO ih35_app;

COMMIT;
