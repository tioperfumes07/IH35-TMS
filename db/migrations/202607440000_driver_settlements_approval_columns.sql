-- [HOLD-FOR-JORGE — FINANCIAL] Settlement collapse Phase 1b — additive approval/finalize/pdf columns on the
-- canonical HEADER driver_finance.driver_settlements, so approval.service.ts's header writes (approve/finalize/
-- pdf, currently on RETIRE settlement.settlement) can repoint onto canonical WITHOUT dropping a field.
-- Additive, idempotent, on a 0-row table; driver_settlements already carries FORCED RLS + grants (inherited).
-- Column names/types verified against settlement.settlement (the RETIRE header source) + prod live schema.
BEGIN;
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES identity.users(id);
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz;
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS pdf_generated_by uuid REFERENCES identity.users(id);
CREATE INDEX IF NOT EXISTS idx_df_driver_settlements_approval_status ON driver_finance.driver_settlements (approval_status);
COMMIT;
