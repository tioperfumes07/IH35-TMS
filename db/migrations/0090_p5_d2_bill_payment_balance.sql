BEGIN;

CREATE SCHEMA IF NOT EXISTS accounting;

CREATE TABLE IF NOT EXISTS accounting.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vendor_id text,
  vendor_uuid text,
  display_id text,
  linked_work_order_uuid uuid,
  bill_number text,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  amount_cents bigint,
  total_amount numeric(12,2),
  paid_cents bigint NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  memo text,
  coa_account_id uuid,
  qbo_bill_id text,
  qbo_sync_pending boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.users(id),
  revoked_reason text
);

ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS vendor_id text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS vendor_uuid text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS linked_work_order_uuid uuid;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS bill_number text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS bill_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS amount_cents bigint;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS total_amount numeric(12,2);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS paid_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS memo text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS coa_account_id uuid;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS qbo_bill_id text;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS qbo_sync_pending boolean NOT NULL DEFAULT false;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS revoked_reason text;

CREATE TABLE IF NOT EXISTS accounting.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bill_id uuid NOT NULL REFERENCES accounting.bills(id),
  vendor_id text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint,
  amount numeric(12,2),
  payment_method text NOT NULL,
  from_bank_account_id uuid,
  check_number text,
  reference_number text,
  memo text,
  qbo_bill_payment_id text,
  advance_id uuid,
  status text NOT NULL DEFAULT 'posted',
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.users(id),
  revoked_reason text
);

ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS vendor_id text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS payment_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS amount_cents bigint;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'check';
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS from_bank_account_id uuid;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS check_number text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS memo text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS qbo_bill_payment_id text;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS advance_id uuid;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS revoked_reason text;

UPDATE accounting.bills
SET amount_cents = COALESCE(amount_cents, ROUND(COALESCE(total_amount, 0) * 100)::bigint),
    paid_cents = COALESCE(
      paid_cents,
      CASE
        WHEN status IN ('paid') THEN ROUND(COALESCE(total_amount, 0) * 100)::bigint
        WHEN status IN ('partial', 'partially_paid') THEN ROUND(COALESCE(paid_amount, 0) * 100)::bigint
        ELSE 0
      END
    ),
    paid_amount = COALESCE(paid_amount, COALESCE(paid_cents, 0)::numeric / 100.0),
    bill_date = COALESCE(bill_date, created_at::date, CURRENT_DATE),
    updated_at = COALESCE(updated_at, now())
WHERE amount_cents IS NULL
   OR paid_cents IS NULL
   OR paid_amount IS NULL
   OR bill_date IS NULL;

UPDATE accounting.bill_payments
SET amount_cents = COALESCE(amount_cents, ROUND(COALESCE(amount, 0) * 100)::bigint),
    amount = COALESCE(amount, COALESCE(amount_cents, 0)::numeric / 100.0),
    payment_date = COALESCE(payment_date, created_at::date, CURRENT_DATE),
    updated_at = COALESCE(updated_at, now())
WHERE amount_cents IS NULL
   OR amount IS NULL
   OR payment_date IS NULL;

ALTER TABLE accounting.bills
  DROP CONSTRAINT IF EXISTS bills_amount_cents_positive;
ALTER TABLE accounting.bills
  ADD CONSTRAINT bills_amount_cents_positive CHECK (amount_cents > 0);

ALTER TABLE accounting.bill_payments
  DROP CONSTRAINT IF EXISTS bill_payments_amount_cents_positive;
ALTER TABLE accounting.bill_payments
  ADD CONSTRAINT bill_payments_amount_cents_positive CHECK (amount_cents > 0);

CREATE INDEX IF NOT EXISTS idx_accounting_bills_company_vendor_status
  ON accounting.bills (operating_company_id, vendor_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_bills_company_due_open
  ON accounting.bills (operating_company_id, due_date)
  WHERE status IN ('open', 'partial', 'partially_paid', 'unpaid');

CREATE INDEX IF NOT EXISTS idx_accounting_bill_payments_bill_id
  ON accounting.bill_payments (bill_id);

CREATE INDEX IF NOT EXISTS idx_accounting_bill_payments_company_date
  ON accounting.bill_payments (operating_company_id, payment_date DESC);

ALTER TABLE accounting.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.bill_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bills_company_scope ON accounting.bills;
CREATE POLICY bills_company_scope
  ON accounting.bills
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS bill_payments_company_scope ON accounting.bill_payments;
CREATE POLICY bill_payments_company_scope
  ON accounting.bill_payments
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON accounting.bills TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.bill_payments TO ih35_app;

CREATE OR REPLACE VIEW accounting.vendor_balances
WITH (security_invoker = true)
AS
WITH normalized AS (
  SELECT
    b.operating_company_id,
    COALESCE(NULLIF(b.vendor_id, ''), NULLIF(b.vendor_uuid, '')) AS vendor_id,
    GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0) AS amount_cents,
    LEAST(
      GREATEST(
        COALESCE(
          b.paid_cents,
          CASE
            WHEN b.status IN ('paid') THEN COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint)
            WHEN b.status IN ('partial', 'partially_paid') THEN ROUND(COALESCE(b.paid_amount, 0) * 100)::bigint
            ELSE 0
          END
        ),
        0
      ),
      GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0)
    ) AS paid_cents,
    b.bill_date,
    b.due_date,
    b.status,
    b.revoked_at
  FROM accounting.bills b
)
SELECT
  n.operating_company_id,
  n.vendor_id,
  SUM(n.amount_cents - n.paid_cents)::bigint AS balance_cents,
  COUNT(*) FILTER (
    WHERE n.status IN ('open', 'partial', 'partially_paid', 'unpaid')
      AND n.amount_cents > n.paid_cents
      AND n.revoked_at IS NULL
  )::int AS open_bill_count,
  MIN(n.due_date) FILTER (
    WHERE n.status IN ('open', 'partial', 'partially_paid', 'unpaid')
      AND n.amount_cents > n.paid_cents
      AND n.revoked_at IS NULL
  ) AS next_due_date,
  MAX(n.bill_date) AS last_bill_date
FROM normalized n
WHERE n.vendor_id IS NOT NULL
  AND n.revoked_at IS NULL
GROUP BY n.operating_company_id, n.vendor_id;

DO $$
DECLARE
  entity_type_constraint text;
BEGIN
  IF to_regclass('integrations.qbo_sync_queue') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
  INTO entity_type_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'integrations'
    AND t.relname = 'qbo_sync_queue'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%';

  IF entity_type_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE integrations.qbo_sync_queue DROP CONSTRAINT %I', entity_type_constraint);
  END IF;

  ALTER TABLE integrations.qbo_sync_queue
    ADD CONSTRAINT qbo_sync_queue_entity_type_check
    CHECK (entity_type IN ('bank_transaction','bill','bill_payment','expense','invoice','journal_entry','settlement','transfer'));
END
$$;

COMMIT;
