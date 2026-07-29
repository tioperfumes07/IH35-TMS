-- ACCT-PAYAPPS / payment_applications unblock — INBOUND QuickBooks Invoice mirror + default-OFF flags.
--
-- CANONICAL-CHECK: qbo_ar_invoice_mirror. Read-only INBOUND QBO Invoice staging clone (mdata).
-- Distinct from accounting.invoices (TMS/QBO projected A/R subledger) and from mdata.qbo_invoices
-- (OUTBOUND TMS→QBO push mirror that requires invoice_id NOT NULL). This table does NOT replace
-- either; it feeds Stage 2 projection INTO accounting.invoices.qbo_invoice_id so
-- accounting.payment_applications Stage 2b can resolve Payment.Line LinkedTxn Invoice ids.
-- No GL. Parallel to mdata.qbo_ar_payments / mdata.qbo_vendor_credits.
--
-- WHY (Neon lucia 2026-07-29 TRANSP): accounting.payments=12123, payment_applications=0,
-- mdata.qbo_ar_payments=23830 with ~12206 Line LinkedTxn Invoice links, accounting.invoices=1 with
-- qbo_invoice_id NULL, mdata.qbo_invoices=0 (outbound-shaped). Stage 2b of qbo-ar-payments-puller
-- joins accounting.invoices.qbo_invoice_id — without an inbound Invoice clone the join always misses.
--
-- SUBLEDGER ONLY — NO GL. Flags DEFAULT OFF. Additive / idempotent / FORCE RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_ar_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  doc_number text,
  customer_qbo_id text,
  customer_name text,
  txn_date date,
  due_date date,
  total_cents bigint NOT NULL DEFAULT 0,
  balance_cents bigint NOT NULL DEFAULT 0,
  currency text,
  private_note text,
  active boolean NOT NULL DEFAULT true,
  qbo_updated_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_qbo_ar_invoices_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_ar_invoices_company_customer
  ON mdata.qbo_ar_invoices (operating_company_id, customer_qbo_id);
CREATE INDEX IF NOT EXISTS ix_qbo_ar_invoices_company_txn_date
  ON mdata.qbo_ar_invoices (operating_company_id, txn_date DESC);

ALTER TABLE mdata.qbo_ar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_ar_invoices FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_ar_invoices TO ih35_app;

DROP POLICY IF EXISTS qbo_ar_invoices_company_scope ON mdata.qbo_ar_invoices;
CREATE POLICY qbo_ar_invoices_company_scope ON mdata.qbo_ar_invoices
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS qbo_ar_invoices_select_office ON mdata.qbo_ar_invoices;
CREATE POLICY qbo_ar_invoices_select_office ON mdata.qbo_ar_invoices
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Accountant'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DO $flags$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES
      (
        'QBO_AR_INVOICE_MIRROR_PULL_ENABLED',
        'Stage 1: clone QuickBooks Invoices into read-only mirror mdata.qbo_ar_invoices '
          || '(upsert by qbo_id). Inbound reconcile-only; no GL; no TMS->QBO write. '
          || 'Unblocks accounting.payment_applications Stage 2b join on qbo_invoice_id. DEFAULT OFF.',
        false,
        0
      ),
      (
        'QBO_AR_INVOICES_PROJECTION_ENABLED',
        'Stage 2: project mdata.qbo_ar_invoices into accounting.invoices (qbo_invoice_id set, '
          || 'source_system=qbo, source=qbo_clone). SUBLEDGER ONLY, NO GL. Customers that do not '
          || 'resolve to mdata.customers.qbo_customer_id are skipped. DEFAULT OFF.',
        false,
        0
      )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $flags$;

COMMIT;
