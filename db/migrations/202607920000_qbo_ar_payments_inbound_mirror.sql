-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json.
--
-- CANONICAL-CHECK: qbo_ar_payment_mirror. Read-only INBOUND QBO Payment (Receive Payment / Deposit
-- against an invoice) staging clone (mdata). Distinct from accounting.payments (TMS/QBO projected AR
-- subledger). No GL. Parallel to mdata.qbo_ap_bill_payments (AP side) / mdata.qbo_purchases.
--
-- QBO-AR-PAYMENTS-PULL-1 — INBOUND QuickBooks A/R receipt (Payment) mirror.
--
-- WHY: The AP side already mirrors QBO's BillPayment (mdata.qbo_ap_bill_payments -> accounting.
-- bill_payments, #3398). The A/R side has NO equivalent — accounting.payments already carries the
-- qbo_payment_id / source_system / qbo_sync_token / source columns (migrations 0178, 202607021800) and a
-- partial-unique idempotency key (uq_payments_company_qbo_payment_id), but no puller has ever populated
-- them. QuickBooks' real Receive-Payment/Deposit history (which invoice(s) got paid, when, how much, by
-- what method, deposited to which account) never lands in TMS, so the A/R subledger and invoice paid-
-- status drift from QuickBooks truth (verified 2026-07-24 on Neon br-fancy-credit-akjnd07a: accounting.
-- payments = 0 rows, accounting.payment_applications = 0 rows, no mdata.qbo_ar_payments /
-- mdata.qbo_payments / mdata.qbo_deposits table exists).
--
-- This adds a read-only INBOUND mirror of every QBO Payment (mdata.qbo_ar_payments), the safe staging
-- clone the qbo-ar-payments-puller writes (gated QBO_AR_PAYMENT_MIRROR_PULL_ENABLED, default OFF —
-- companion migration 202607930000). A second, separately gated step (QBO_AR_PAYMENTS_PROJECTION_ENABLED,
-- default OFF) projects the mirror header into accounting.payments (qbo_payment_id set, one row per QBO
-- Payment — NO fan-out needed at the header, unlike BillPayment) and fans each Payment's
-- Line[].LinkedTxn(Invoice) out into accounting.payment_applications (one row per (payment, invoice)
-- allocation, matched to accounting.invoices by qbo_invoice_id). Both existing partial-unique keys
-- (uq_payments_company_qbo_payment_id; uq_payment_applications_target on (payment_id, target_kind,
-- target_id)) are ALREADY fan-out-safe for this shape — no schema change needed there (unlike the AP
-- BillPayment case, which required replacing a 2-col unique with a 3-col composite).
--
-- NO GL/journal is posted — GL stays QuickBooks' job. The full QBO row is retained in payload_json so
-- the allocation fan-out (Stage 2b) can read Payment.Line[] without a second network round-trip.
--
-- Additive only. Idempotent (IF NOT EXISTS / DO guards). FORCED RLS by operating_company_id. GRANTed to
-- ih35_app. Reversible: see DOWN section at file end. Apply-twice safe (validated on throwaway Postgres).

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_ar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  doc_number text,
  customer_qbo_id text,
  customer_name text,
  txn_date date,
  total_cents bigint NOT NULL DEFAULT 0,
  unapplied_cents bigint,
  deposit_to_account_qbo_id text,
  payment_method_qbo_id text,
  payment_method_name text,
  payment_ref_num text,
  currency text,
  private_note text,
  active boolean NOT NULL DEFAULT true,
  qbo_updated_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_qbo_ar_payments_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_ar_payments_company_customer
  ON mdata.qbo_ar_payments (operating_company_id, customer_qbo_id);
CREATE INDEX IF NOT EXISTS ix_qbo_ar_payments_company_date
  ON mdata.qbo_ar_payments (operating_company_id, txn_date DESC);

ALTER TABLE mdata.qbo_ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_ar_payments FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_ar_payments TO ih35_app;

-- Sync writer (lucia bypass) + opco-scoped read/write.
DROP POLICY IF EXISTS qbo_ar_payments_company_scope ON mdata.qbo_ar_payments;
CREATE POLICY qbo_ar_payments_company_scope ON mdata.qbo_ar_payments
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
DROP POLICY IF EXISTS qbo_ar_payments_select_office ON mdata.qbo_ar_payments;
CREATE POLICY qbo_ar_payments_select_office ON mdata.qbo_ar_payments
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
-- DROP POLICY IF EXISTS qbo_ar_payments_select_office ON mdata.qbo_ar_payments;
-- DROP POLICY IF EXISTS qbo_ar_payments_company_scope ON mdata.qbo_ar_payments;
-- DROP TABLE IF EXISTS mdata.qbo_ar_payments;
-- COMMIT;
