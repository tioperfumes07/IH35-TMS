-- QBO-AP-PULL-1 — INBOUND QuickBooks A/P (Bill) mirror.
--
-- WHY: TMS A/P aging reads accounting.bills, but no QBO->TMS *transaction* puller ever existed —
-- only master-data pullers (vendors/customers/accounts -> mdata.qbo_*) and OUTBOUND bill push
-- (mdata.qbo_bills has a NOT NULL FK to accounting.bills, so it can only hold TMS-originated bills).
-- Result: QBO's live ~$1.22M A/P never lands in TMS and the aging screen shows $0.
--
-- This adds a read-only INBOUND mirror of every QBO Bill (mdata.qbo_ap_bills), the safe staging clone
-- the ap-bills-puller writes (gated QBO_AP_MIRROR_PULL_ENABLED, default OFF). A second, separately
-- gated step (QBO_AP_BILLS_PROJECTION_ENABLED, default OFF) projects this mirror into accounting.bills
-- (source_system='qbo'); that table already carries the idempotency key uq_bills_company_qbo_bill_id
-- and source_system IN ('tms','qbo'), so NO change to accounting.bills is needed here.
--
-- Additive only. Idempotent (IF NOT EXISTS / DO guards). RLS by operating_company_id. GRANTed to ih35_app.
-- Reversible: see DOWN section at file end.

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_ap_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  doc_number text,
  vendor_qbo_id text,
  vendor_name text,
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
  CONSTRAINT uq_qbo_ap_bills_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_ap_bills_company_vendor
  ON mdata.qbo_ap_bills (operating_company_id, vendor_qbo_id);
CREATE INDEX IF NOT EXISTS ix_qbo_ap_bills_company_open
  ON mdata.qbo_ap_bills (operating_company_id, balance_cents)
  WHERE balance_cents > 0;

ALTER TABLE mdata.qbo_ap_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_ap_bills FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_ap_bills TO ih35_app;

-- Sync writer (lucia bypass) + opco-scoped read/write.
DROP POLICY IF EXISTS qbo_ap_bills_company_scope ON mdata.qbo_ap_bills;
CREATE POLICY qbo_ap_bills_company_scope ON mdata.qbo_ap_bills
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
DROP POLICY IF EXISTS qbo_ap_bills_select_office ON mdata.qbo_ap_bills;
CREATE POLICY qbo_ap_bills_select_office ON mdata.qbo_ap_bills
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
-- DROP POLICY IF EXISTS qbo_ap_bills_select_office ON mdata.qbo_ap_bills;
-- DROP POLICY IF EXISTS qbo_ap_bills_company_scope ON mdata.qbo_ap_bills;
-- DROP TABLE IF EXISTS mdata.qbo_ap_bills;
-- COMMIT;
