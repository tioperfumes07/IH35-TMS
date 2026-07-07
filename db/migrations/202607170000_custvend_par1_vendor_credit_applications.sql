BEGIN;

-- CUSTVEND-PAR-1: vendor_credit_applications — tracks which bills each vendor credit was applied to.
-- accounting.vendor_credits already exists (migration 0222). This adds the apply-to-bill junction
-- so partial-apply, remainder, and void flows can be tracked per-bill without mutating the credit row
-- structure. amount_applied_cents on the credit itself is kept in sync via the routes layer.
-- NO GL posting — marks QBO-parity data only; posting rides the existing bill-GL chain when enabled.

CREATE TABLE IF NOT EXISTS accounting.vendor_credit_applications (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid          NOT NULL REFERENCES org.companies(id),
  credit_id              uuid          NOT NULL REFERENCES accounting.vendor_credits(id),
  bill_id                uuid          NOT NULL REFERENCES accounting.bills(id),
  applied_cents          bigint        NOT NULL CHECK (applied_cents > 0),
  applied_at             timestamptz   NOT NULL DEFAULT now(),
  applied_by_user_id     uuid          REFERENCES identity.users(id),
  voided_at              timestamptz,
  voided_by_user_id      uuid          REFERENCES identity.users(id),
  voided_reason          text
);

CREATE INDEX IF NOT EXISTS idx_vca_credit
  ON accounting.vendor_credit_applications(operating_company_id, credit_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vca_bill
  ON accounting.vendor_credit_applications(operating_company_id, bill_id)
  WHERE voided_at IS NULL;

ALTER TABLE accounting.vendor_credit_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vca_company_scope ON accounting.vendor_credit_applications;
CREATE POLICY vca_company_scope ON accounting.vendor_credit_applications
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON accounting.vendor_credit_applications TO ih35_app;

COMMIT;
