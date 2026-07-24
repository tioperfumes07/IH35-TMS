-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] QBO-EXPENSES-PULL-1 — INBOUND QuickBooks Purchase mirror.
-- DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod db:migrate
-- HELD-SKIPs it. Registered in db/migrations/.held-migrations.json.
--
-- WHY: TMS expense/spend reporting reads accounting.expenses, but no QBO->TMS *Purchase* puller ever
-- existed — only master-data pullers (vendors/accounts -> mdata.qbo_*) and an OUTBOUND expense->Purchase
-- translator (translators/expense.ts). So QBO's live cash/card spend (Purchase txns) never lands in TMS
-- and accounting.expenses is empty (verified 2026-07-24 on Neon br-fancy-credit-akjnd07a: 0 rows).
--
-- This adds a read-only INBOUND mirror of every QBO Purchase (mdata.qbo_purchases), the safe staging
-- clone the qbo-purchases-puller writes (gated QBO_PURCHASES_MIRROR_PULL_ENABLED, default OFF — companion
-- migration 202607870000). A second, separately gated step (QBO_EXPENSES_PROJECTION_ENABLED, default OFF)
-- projects this mirror into accounting.expenses (qbo_purchase_id set) + accounting.expense_lines. The full
-- QBO row is retained in payload_json so the line projection (Stage 2b) can read Purchase.Line[] without a
-- second network round-trip or a second mirror table.
--
-- ARCHITECTURE: parallel double-books, reconcile-ONLY. One-directional QBO -> TMS READ-IN into the
-- expense SUBLEDGER only. NO GL/journal posting is performed by this path (GL stays QuickBooks' job);
-- the posting engine additionally REFUSES to post any qbo-sourced expense (EXPENSE_POST_GL_REFUSED). No
-- TMS -> QBO write is introduced. Never invents mirror rows from TMS expenses.
--
-- Additive only. Idempotent (IF NOT EXISTS / DO guards). RLS by operating_company_id (FORCED). GRANTed to
-- ih35_app per the 0065 accounting/mdata schema convention. Reversible: see DOWN section at file end.

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  doc_number text,
  -- PaymentType: 'Cash' | 'Check' | 'CreditCard' (QBO Purchase.PaymentType).
  payment_type text,
  -- AccountRef: the bank/credit-card/cash account the money came FROM (QBO Purchase.AccountRef).
  account_qbo_id text,
  account_name text,
  -- EntityRef: the payee (QBO Purchase.EntityRef) — Vendor | Customer | Employee.
  entity_qbo_id text,
  entity_type text,
  entity_name text,
  txn_date date,
  total_cents bigint NOT NULL DEFAULT 0,
  currency text,
  private_note text,
  active boolean NOT NULL DEFAULT true,
  qbo_updated_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_qbo_purchases_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_purchases_company_entity
  ON mdata.qbo_purchases (operating_company_id, entity_qbo_id);
CREATE INDEX IF NOT EXISTS ix_qbo_purchases_company_txn_date
  ON mdata.qbo_purchases (operating_company_id, txn_date);

ALTER TABLE mdata.qbo_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_purchases FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_purchases TO ih35_app;

-- Sync writer (lucia bypass) + opco-scoped read/write.
DROP POLICY IF EXISTS qbo_purchases_company_scope ON mdata.qbo_purchases;
CREATE POLICY qbo_purchases_company_scope ON mdata.qbo_purchases
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
DROP POLICY IF EXISTS qbo_purchases_select_office ON mdata.qbo_purchases;
CREATE POLICY qbo_purchases_select_office ON mdata.qbo_purchases
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
-- DROP POLICY IF EXISTS qbo_purchases_select_office ON mdata.qbo_purchases;
-- DROP POLICY IF EXISTS qbo_purchases_company_scope ON mdata.qbo_purchases;
-- DROP TABLE IF EXISTS mdata.qbo_purchases;
-- COMMIT;
