-- SCENTSX B9 — cash log, Form 8300 cases, structuring alerts.
--
-- Owner 2026-11-26 20:18 CT "compliance for money forms 8890 money laundering etc fincen" (the form is IRS Form 8300; design
-- https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC section 8, rules from the IRS Form 8300 instructions rev. 12/2023).
--
-- The money itself is received by the EXISTING payment engine (accounting.payments, which posts to the GL). This schema is the
-- compliance record on top of it: every cash-like ScentsX receipt is logged with its payment form and payer; receipts that the
-- IRS counts as "cash" are added up per payer (24-hour related automatically, longer by a manual link, within 12 months); the
-- receipt that takes the unreported total over the threshold opens a Form 8300 case due 15 days later; several receipts just
-- under the threshold raise a structuring alert. Thresholds are settings, not code (FinCEN geographic orders have used
-- $3,000). Nothing here is ever deleted (no DELETE grant); mistakes are voided with a reason.
--
-- Payer identity: the case needs name, address, TIN, date of birth, occupation and ID. Full SSN / ITIN / ID numbers are NOT
-- stored in this database (only the last 4 digits and a copy of the ID in docs.files); the full number is typed into the
-- IRS BSA e-filing system at filing time from the ID copy.

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.compliance_settings (
  operating_company_id uuid PRIMARY KEY REFERENCES org.companies(id),
  cash_report_threshold_cents bigint NOT NULL DEFAULT 1000000 CHECK (cash_report_threshold_cents > 0),
  filing_days integer NOT NULL DEFAULT 15 CHECK (filing_days BETWEEN 1 AND 60),
  related_window_hours integer NOT NULL DEFAULT 24 CHECK (related_window_hours > 0),
  aggregation_window_days integer NOT NULL DEFAULT 365 CHECK (aggregation_window_days > 0),
  structuring_floor_cents bigint NOT NULL DEFAULT 800000 CHECK (structuring_floor_cents > 0),
  structuring_window_days integer NOT NULL DEFAULT 30 CHECK (structuring_window_days > 0),
  structuring_min_count integer NOT NULL DEFAULT 2 CHECK (structuring_min_count >= 2),
  updated_by uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (structuring_floor_cents < cash_report_threshold_cents)
);

-- One payer = the person or business that hands over the cash (Form 8300 Part I / II). Linked to the TIO Perfumes contact
-- and, when it is one, ScentsX's customer.
CREATE TABLE IF NOT EXISTS scentsx.cash_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  payer_kind text NOT NULL CHECK (payer_kind IN ('individual', 'business')),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) > 0),
  contact_company_id uuid REFERENCES perfume.contact_companies(id),
  customer_id uuid REFERENCES mdata.customers(id),
  address_line text,
  city text,
  state_region text,
  postal_code text,
  country text,
  date_of_birth date,
  occupation text,
  tin_kind text CHECK (tin_kind IS NULL OR tin_kind IN ('ssn', 'itin', 'ein', 'foreign_none')),
  tin_last4 text CHECK (tin_last4 IS NULL OR tin_last4 ~ '^[0-9]{4}$'),
  id_type text CHECK (id_type IS NULL OR id_type IN ('drivers_license', 'passport', 'alien_registration', 'ine_mexico', 'other_government')),
  id_issuer text,
  id_number_last4 text CHECK (id_number_last4 IS NULL OR id_number_last4 ~ '^[A-Za-z0-9]{4}$'),
  id_copy_file_id uuid REFERENCES docs.files(id),
  identity_completed_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_scentsx_cash_payers_contact ON scentsx.cash_payers (contact_company_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_cash_payers_customer ON scentsx.cash_payers (customer_id);

CREATE TABLE IF NOT EXISTS scentsx.form_8300_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  case_no text NOT NULL,
  payer_id uuid NOT NULL REFERENCES scentsx.cash_payers(id),
  reason text NOT NULL CHECK (reason IN ('over_threshold', 'voluntary_suspicious')),
  suspicious_reason text,
  first_received_at timestamptz NOT NULL,
  crossed_at timestamptz NOT NULL,
  total_cash_cents bigint NOT NULL CHECK (total_cash_cents > 0),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filed', 'void')),
  filed_at timestamptz,
  filed_by uuid REFERENCES identity.users(id),
  bsa_confirmation text,
  filed_copy_file_id uuid REFERENCES docs.files(id),
  payer_statement_sent_on date,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  void_reason text,
  CHECK (reason <> 'voluntary_suspicious' OR suspicious_reason IS NOT NULL),
  CHECK (status <> 'filed' OR (filed_at IS NOT NULL AND filed_by IS NOT NULL AND bsa_confirmation IS NOT NULL)),
  CHECK (status <> 'void' OR void_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_form_8300_case_no ON scentsx.form_8300_cases (operating_company_id, case_no);
CREATE INDEX IF NOT EXISTS idx_scentsx_form_8300_payer ON scentsx.form_8300_cases (payer_id);

-- Every cash-like receipt. counts_as_cash follows the IRS definition: currency always; a cashier's check, money order, bank
-- draft or traveler's check only when its face amount is $10,000 or less AND it is used in a retail sale of a consumer durable
-- or the business knows it is used to avoid reporting. A personal check, wire or card is logged (so the payer history is
-- complete) but never counts.
CREATE TABLE IF NOT EXISTS scentsx.cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  receipt_no text NOT NULL,
  payer_id uuid NOT NULL REFERENCES scentsx.cash_payers(id),
  payment_id uuid REFERENCES accounting.payments(id),
  invoice_id uuid REFERENCES accounting.invoices(id),
  sales_order_id uuid REFERENCES perfume.sales_orders(id),
  received_at timestamptz NOT NULL,
  payment_form text NOT NULL CHECK (payment_form IN ('currency_usd', 'currency_foreign', 'cashiers_check', 'money_order',
                                                     'bank_draft', 'travelers_check', 'personal_check', 'wire', 'card')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  foreign_currency_code text,
  instrument_issuer text,
  instrument_serial text,
  consumer_durable_retail boolean NOT NULL DEFAULT false,
  known_avoidance boolean NOT NULL DEFAULT false,
  counts_as_cash boolean GENERATED ALWAYS AS (
    payment_form IN ('currency_usd', 'currency_foreign')
    OR (payment_form IN ('cashiers_check', 'money_order', 'bank_draft', 'travelers_check')
        AND amount_cents <= 1000000 AND (consumer_durable_retail OR known_avoidance))
  ) STORED,
  related_receipt_id uuid REFERENCES scentsx.cash_receipts(id),
  case_id uuid REFERENCES scentsx.form_8300_cases(id),
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES identity.users(id),
  void_reason text,
  CHECK (payment_form NOT IN ('cashiers_check', 'money_order', 'bank_draft', 'travelers_check')
         OR (instrument_issuer IS NOT NULL AND instrument_serial IS NOT NULL)),
  CHECK (payment_form <> 'currency_foreign' OR foreign_currency_code IS NOT NULL),
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_cash_receipt_no ON scentsx.cash_receipts (operating_company_id, receipt_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_cash_receipt_payment ON scentsx.cash_receipts (payment_id) WHERE payment_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scentsx_cash_receipts_payer_time ON scentsx.cash_receipts (payer_id, received_at);
CREATE INDEX IF NOT EXISTS idx_scentsx_cash_receipts_case ON scentsx.cash_receipts (case_id);

CREATE TABLE IF NOT EXISTS scentsx.structuring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  payer_id uuid NOT NULL REFERENCES scentsx.cash_payers(id),
  trigger_receipt_id uuid NOT NULL REFERENCES scentsx.cash_receipts(id),
  receipt_count integer NOT NULL,
  window_total_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES identity.users(id),
  review_note text,
  case_id uuid REFERENCES scentsx.form_8300_cases(id),
  CHECK (reviewed_at IS NULL OR (reviewed_by IS NOT NULL AND review_note IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_structuring_trigger ON scentsx.structuring_alerts (trigger_receipt_id);

-- The ScentsX wall: every row of these tables belongs to SCENTSX, and a receipt's payment / invoice must be ScentsX's.
CREATE OR REPLACE FUNCTION scentsx.refuse_non_scentsx_compliance_row() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, accounting
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  v_co uuid;
BEGIN
  IF v_sx IS NULL OR NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION '% row must belong to SCENTSX', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'cash_receipts' THEN
    IF NEW.payment_id IS NOT NULL THEN
      SELECT operating_company_id INTO v_co FROM accounting.payments WHERE id = NEW.payment_id;
      IF v_co IS DISTINCT FROM v_sx THEN
        RAISE EXCEPTION 'cash receipt names a payment of another company (%)', v_co USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      SELECT operating_company_id INTO v_co FROM accounting.invoices WHERE id = NEW.invoice_id;
      IF v_co IS DISTINCT FROM v_sx THEN
        RAISE EXCEPTION 'cash receipt names an invoice of another company (%)', v_co USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  -- Nested IFs: PL/pgSQL does not promise to short-circuit AND, and NEW of other tables has no customer_id.
  IF TG_TABLE_NAME = 'cash_payers' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT operating_company_id INTO v_co FROM mdata.customers WHERE id = NEW.customer_id;
      IF v_co IS DISTINCT FROM v_sx THEN
        RAISE EXCEPTION 'cash payer names a customer of another company (%)', v_co USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_settings', 'cash_payers', 'form_8300_cases', 'cash_receipts', 'structuring_alerts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_scentsx_wall ON scentsx.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.%1$I FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_compliance_row()', t);
    EXECUTE format('ALTER TABLE scentsx.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE scentsx.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_entity_select ON scentsx.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_entity_write ON scentsx.%1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_entity_select ON scentsx.%1$I FOR SELECT
      USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_entity_write ON scentsx.%1$I FOR ALL
      USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
      WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON scentsx.%I TO ih35_app', t);
  END LOOP;
END $$;

-- The ScentsX settings row (IRS defaults). Idempotent.
INSERT INTO scentsx.compliance_settings (operating_company_id)
SELECT id FROM org.companies WHERE code = 'SCENTSX'
ON CONFLICT (operating_company_id) DO NOTHING;

COMMIT;
