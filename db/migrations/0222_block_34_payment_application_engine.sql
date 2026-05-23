BEGIN;

ALTER TABLE accounting.payment_applications
  ADD COLUMN IF NOT EXISTS target_kind text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS amount_applied numeric(18,2),
  ADD COLUMN IF NOT EXISTS applied_by_user_uuid uuid REFERENCES identity.users(id);

UPDATE accounting.payment_applications
SET target_kind = 'invoice'
WHERE target_kind IS NULL;

UPDATE accounting.payment_applications
SET target_id = invoice_id
WHERE target_id IS NULL;

UPDATE accounting.payment_applications
SET amount_applied = (amount_cents::numeric / 100.0)
WHERE amount_applied IS NULL;

UPDATE accounting.payment_applications
SET applied_by_user_uuid = applied_by_user_id
WHERE applied_by_user_uuid IS NULL
  AND applied_by_user_id IS NOT NULL;

ALTER TABLE accounting.payment_applications
  ALTER COLUMN target_kind SET NOT NULL,
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN amount_applied SET NOT NULL,
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE accounting.payment_applications
  DROP CONSTRAINT IF EXISTS payment_applications_target_kind_check;

ALTER TABLE accounting.payment_applications
  ADD CONSTRAINT payment_applications_target_kind_check
  CHECK (target_kind IN ('invoice', 'bill', 'credit_memo'));

ALTER TABLE accounting.payment_applications
  DROP CONSTRAINT IF EXISTS payment_applications_target_invoice_check;

ALTER TABLE accounting.payment_applications
  ADD CONSTRAINT payment_applications_target_invoice_check
  CHECK (
    (target_kind = 'invoice' AND invoice_id IS NOT NULL)
    OR (target_kind <> 'invoice')
  );

ALTER TABLE accounting.payment_applications
  DROP CONSTRAINT IF EXISTS payment_applications_payment_id_invoice_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_applications_target
  ON accounting.payment_applications(payment_id, target_kind, target_id);

CREATE INDEX IF NOT EXISTS idx_payment_applications_target
  ON accounting.payment_applications(target_kind, target_id);

CREATE TABLE IF NOT EXISTS accounting.vendor_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vendor_id text NOT NULL,
  source_payment_id uuid REFERENCES accounting.payments(id) ON DELETE SET NULL,
  display_id text NOT NULL CHECK (display_id ~ '^VC-[0-9]{4}-[0-9]{4}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'voided')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_applied_cents bigint NOT NULL DEFAULT 0 CHECK (amount_applied_cents >= 0),
  amount_unapplied_cents bigint GENERATED ALWAYS AS (amount_cents - amount_applied_cents) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  UNIQUE (operating_company_id, display_id),
  CHECK (amount_applied_cents <= amount_cents)
);

CREATE INDEX IF NOT EXISTS idx_vendor_credits_vendor
  ON accounting.vendor_credits(operating_company_id, vendor_id, issue_date DESC);

ALTER TABLE accounting.vendor_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_credits_company_scope ON accounting.vendor_credits;
CREATE POLICY vendor_credits_company_scope ON accounting.vendor_credits
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.vendor_credits TO ih35_app;

COMMIT;
