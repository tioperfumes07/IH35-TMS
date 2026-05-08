BEGIN;

CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS views;

-- ============================================================
-- ACCOUNTING.INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  display_id text NOT NULL CHECK (display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'void', 'factored')),

  source_load_id uuid REFERENCES mdata.loads(id),

  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  delivery_date date,
  sent_at timestamptz,
  voided_at timestamptz,
  void_reason text,

  subtotal_cents bigint NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  amount_paid_cents bigint NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  amount_open_cents bigint GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED,
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code IN ('USD', 'MXN')),

  payment_terms_id uuid REFERENCES catalogs.payment_terms(id),
  payment_terms_label text,
  payment_terms_days int CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),

  ar_email_snapshot text,
  ar_phone_snapshot text,

  internal_notes text,
  customer_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id),

  UNIQUE (operating_company_id, display_id),
  CHECK (amount_paid_cents <= total_cents)
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON accounting.invoices(customer_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_open
  ON accounting.invoices(operating_company_id, due_date)
  WHERE status IN ('sent', 'partial');
CREATE INDEX IF NOT EXISTS idx_invoices_load ON accounting.invoices(source_load_id);

-- ============================================================
-- ACCOUNTING.INVOICE_LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE,
  source_load_id uuid REFERENCES mdata.loads(id),
  line_type text NOT NULL CHECK (
    line_type IN ('linehaul', 'fsc', 'detention', 'layover', 'lumper', 'tonu', 'accessorial', 'tax', 'adjustment', 'other')
  ),
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents bigint NOT NULL CHECK (unit_amount_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  qbo_class_snapshot text,
  qbo_item_id text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON accounting.invoice_lines(invoice_id, display_order);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_load ON accounting.invoice_lines(source_load_id);

-- ============================================================
-- ACCOUNTING.PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  display_id text NOT NULL CHECK (display_id ~ '^PMT-[0-9]{4}-[0-9]{5}$'),
  payment_method text NOT NULL CHECK (
    payment_method IN ('ach', 'wire', 'check', 'cash', 'factoring_advance', 'factoring_reserve', 'credit_card', 'other')
  ),
  payment_date date NOT NULL,
  reference text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_applied_cents bigint NOT NULL DEFAULT 0 CHECK (amount_applied_cents >= 0),
  amount_unapplied_cents bigint GENERATED ALWAYS AS (amount_cents - amount_applied_cents) STORED,
  deposited_to_account_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  UNIQUE (operating_company_id, display_id),
  CHECK (amount_applied_cents <= amount_cents)
);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON accounting.payments(customer_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_unapplied
  ON accounting.payments(operating_company_id)
  WHERE amount_unapplied_cents > 0 AND voided_at IS NULL;

-- ============================================================
-- ACCOUNTING.PAYMENT_APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  payment_id uuid NOT NULL REFERENCES accounting.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by_user_id uuid REFERENCES identity.users(id),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_pmt_apps_invoice ON accounting.payment_applications(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pmt_apps_payment ON accounting.payment_applications(payment_id);

-- ============================================================
-- ACCOUNTING.CREDIT_MEMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  related_invoice_id uuid REFERENCES accounting.invoices(id),
  display_id text NOT NULL CHECK (display_id ~ '^CM-[0-9]{4}-[0-9]{4}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'applied', 'voided')),
  reason text NOT NULL CHECK (reason IN ('damage', 'shortage', 'rate_dispute', 'duplicate_billing', 'detention_dispute', 'other')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_applied_cents bigint NOT NULL DEFAULT 0 CHECK (amount_applied_cents >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  UNIQUE (operating_company_id, display_id),
  CHECK (amount_applied_cents <= amount_cents)
);

CREATE INDEX IF NOT EXISTS idx_credit_memos_customer ON accounting.credit_memos(customer_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_memos_invoice ON accounting.credit_memos(related_invoice_id);

-- ============================================================
-- VIEWS.AR_AGING
-- ============================================================
CREATE OR REPLACE VIEW views.ar_aging
WITH (security_invoker = true)
AS
SELECT
  i.operating_company_id,
  i.customer_id,
  c.customer_name AS customer_name,
  COUNT(*) FILTER (WHERE i.amount_open_cents > 0) AS open_invoice_count,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date >= CURRENT_DATE), 0) AS current_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE AND i.due_date >= CURRENT_DATE - 30), 0) AS bucket_1_30_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE - 30 AND i.due_date >= CURRENT_DATE - 60), 0) AS bucket_31_60_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE - 60 AND i.due_date >= CURRENT_DATE - 90), 0) AS bucket_61_90_cents,
  COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE - 90), 0) AS bucket_91_plus_cents,
  COALESCE(SUM(i.amount_open_cents), 0) AS total_open_cents
FROM accounting.invoices i
JOIN mdata.customers c ON c.id = i.customer_id
WHERE i.status IN ('sent', 'partial')
  AND i.voided_at IS NULL
GROUP BY i.operating_company_id, i.customer_id, c.customer_name;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE accounting.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.payment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.credit_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_company_scope ON accounting.invoices;
CREATE POLICY invoices_company_scope ON accounting.invoices
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS invoice_lines_company_scope ON accounting.invoice_lines;
CREATE POLICY invoice_lines_company_scope ON accounting.invoice_lines
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS payments_company_scope ON accounting.payments;
CREATE POLICY payments_company_scope ON accounting.payments
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS payment_applications_company_scope ON accounting.payment_applications;
CREATE POLICY payment_applications_company_scope ON accounting.payment_applications
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS credit_memos_company_scope ON accounting.credit_memos;
CREATE POLICY credit_memos_company_scope ON accounting.credit_memos
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.invoices TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.invoice_lines TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.payments TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.payment_applications TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.credit_memos TO ih35_app;
GRANT SELECT ON views.ar_aging TO ih35_app;

-- ============================================================
-- TRIGGERS: payment applications keep invoice/payment totals synced
-- ============================================================
CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
  v_new_invoice_id uuid := NULL;
  v_old_invoice_id uuid := NULL;
  v_paid bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_invoice_id := NEW.invoice_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_invoice_id := OLD.invoice_id;
  END IF;

  FOR v_invoice_id IN
    SELECT DISTINCT x.invoice_id
    FROM (VALUES (v_new_invoice_id), (v_old_invoice_id)) AS x(invoice_id)
    WHERE x.invoice_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_paid
    FROM accounting.payment_applications
    WHERE invoice_id = v_invoice_id;

    UPDATE accounting.invoices i
    SET
      amount_paid_cents = v_paid,
      status = CASE
        WHEN i.status = 'void' THEN 'void'
        WHEN i.status = 'factored' THEN 'factored'
        WHEN v_paid >= i.total_cents AND i.total_cents > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        WHEN i.status IN ('partial', 'paid') THEN 'sent'
        ELSE i.status
      END,
      updated_at = now()
    WHERE i.id = v_invoice_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pmt_app_recompute_invoice ON accounting.payment_applications;
CREATE TRIGGER pmt_app_recompute_invoice
AFTER INSERT OR UPDATE OR DELETE ON accounting.payment_applications
FOR EACH ROW EXECUTE FUNCTION accounting.recompute_invoice_paid();

CREATE OR REPLACE FUNCTION accounting.recompute_payment_applied()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id uuid;
  v_new_payment_id uuid := NULL;
  v_old_payment_id uuid := NULL;
  v_applied bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_payment_id := NEW.payment_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_payment_id := OLD.payment_id;
  END IF;

  FOR v_payment_id IN
    SELECT DISTINCT x.payment_id
    FROM (VALUES (v_new_payment_id), (v_old_payment_id)) AS x(payment_id)
    WHERE x.payment_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_applied
    FROM accounting.payment_applications
    WHERE payment_id = v_payment_id;

    UPDATE accounting.payments p
    SET amount_applied_cents = v_applied
    WHERE p.id = v_payment_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pmt_app_recompute_payment ON accounting.payment_applications;
CREATE TRIGGER pmt_app_recompute_payment
AFTER INSERT OR UPDATE OR DELETE ON accounting.payment_applications
FOR EACH ROW EXECUTE FUNCTION accounting.recompute_payment_applied();

COMMIT;
