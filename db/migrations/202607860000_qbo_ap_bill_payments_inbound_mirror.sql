-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json.
--
-- QBO-AP-BILLPAY-PULL-1 — INBOUND QuickBooks A/P payment (BillPayment) mirror.
--
-- WHY: The QBO→TMS A/P clone (mdata.qbo_ap_bills -> accounting.bills, held 202606290110 + puller
-- ap-bills-puller.ts) lands the OPEN bills but never lands the PAYMENTS QuickBooks made against them.
-- accounting.bill_payments therefore only ever carries TMS-native rows; QBO's real settlement history
-- (which bill was paid, when, how much, by what method) never mirrors into the A/P subledger, so
-- vendor payment history / bill paid-status drift from QuickBooks truth.
--
-- This adds a read-only INBOUND mirror of every QBO BillPayment (mdata.qbo_ap_bill_payments), the safe
-- staging clone the ap-bill-payments-puller writes (gated QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED,
-- default OFF). A second, separately gated step (QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED, default OFF)
-- fans each BillPayment's Line[].LinkedTxn(Bill) out into accounting.bill_payments (source_system='qbo',
-- one row per (payment, bill) allocation). NO GL/journal is posted — GL stays QuickBooks' job. The
-- header stores PayType + the bank/CC account refs for later reconcile; the projected subledger row
-- leaves from_bank_account_id NULL for now (owner reconcile pass wires bank linkage separately).
--
-- Additive only. Idempotent (IF NOT EXISTS / DO guards). FORCED RLS by operating_company_id. GRANTed to
-- ih35_app. Reversible: see DOWN section at file end. Apply-twice safe (validated on throwaway Postgres).

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_ap_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  doc_number text,
  vendor_qbo_id text,
  vendor_name text,
  txn_date date,
  total_cents bigint NOT NULL DEFAULT 0,
  pay_type text,
  bank_account_qbo_id text,
  cc_account_qbo_id text,
  currency text,
  private_note text,
  active boolean NOT NULL DEFAULT true,
  qbo_updated_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_qbo_ap_bill_payments_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_ap_bill_payments_company_vendor
  ON mdata.qbo_ap_bill_payments (operating_company_id, vendor_qbo_id);
CREATE INDEX IF NOT EXISTS ix_qbo_ap_bill_payments_company_date
  ON mdata.qbo_ap_bill_payments (operating_company_id, txn_date DESC);

ALTER TABLE mdata.qbo_ap_bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_ap_bill_payments FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_ap_bill_payments TO ih35_app;

-- Sync writer (lucia bypass) + opco-scoped read/write.
DROP POLICY IF EXISTS qbo_ap_bill_payments_company_scope ON mdata.qbo_ap_bill_payments;
CREATE POLICY qbo_ap_bill_payments_company_scope ON mdata.qbo_ap_bill_payments
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

-- Authenticated office roles can read mirror rows for accessible operating companies.
DROP POLICY IF EXISTS qbo_ap_bill_payments_select_office ON mdata.qbo_ap_bill_payments;
CREATE POLICY qbo_ap_bill_payments_select_office ON mdata.qbo_ap_bill_payments
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

COMMIT;

-- DOWN
-- BEGIN;
-- DROP POLICY IF EXISTS qbo_ap_bill_payments_select_office ON mdata.qbo_ap_bill_payments;
-- DROP POLICY IF EXISTS qbo_ap_bill_payments_company_scope ON mdata.qbo_ap_bill_payments;
-- DROP TABLE IF EXISTS mdata.qbo_ap_bill_payments;
-- COMMIT;
