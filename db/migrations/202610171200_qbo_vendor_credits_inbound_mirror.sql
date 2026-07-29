-- ACCT-F47 / ACCT-ECON-05 — INBOUND QuickBooks VendorCredit mirror + the two default-OFF stage flags.
--
-- Ships via db:migrate on deploy (NOT a held migration): it only CREATEs a new read-only mirror table and
-- registers two flag catalog rows, both DEFAULT OFF. Nothing in this file writes money, posts GL, or turns
-- a stage on.
--
-- WHY (root cause, verified LIVE on Neon br-fancy-credit-akjnd07a 2026-07-29 in a
-- `set_config('app.bypass_rls','lucia',true)` transaction, so this is NOT an RLS-masked false empty):
--   accounting.vendor_credits            = 0 rows
--   accounting.vendor_credit_applications = 0 rows
--   accounting.bills                     = 16219 rows   (A/P itself is dense)
--   mdata.vendors                        = 2791 rows, 2782 with qbo_vendor_id
-- The subledger is empty for one reason only: there has never been a QBO→TMS VendorCredit puller,
-- mirror table, projector or flag. Every other A/P feed has one (mdata.qbo_ap_bills,
-- qbo_ap_bill_payments, qbo_purchases, qbo_ar_payments). Live density comes from the QBO VendorCredit
-- API after flags are enabled per-entity — not from qbo_archive (FORCED-RLS; do not treat archive counts
-- as the acceptance source). This closes the missing-pipeline hole.
--
-- ARCHITECTURE: parallel double-books, reconcile-ONLY. One-directional QBO -> TMS READ-IN into the A/P
-- vendor-credit SUBLEDGER only. NO GL/journal posting on this path — GL stays QuickBooks' job, exactly like
-- the QBO Purchase -> accounting.expenses and QBO Payment -> accounting.payments clones. There is no
-- vendor-credit code path in posting-engine.service.ts at all (grep: zero hits), so the subledger-only
-- invariant here is structural, not a flag. NO TMS -> QBO write is introduced. QBO_JE_PUSH_ENABLED and
-- QBO_ENTITY_PUSH_ENABLED are untouched and stay OFF.
--
-- The full QBO row is retained in payload_json so a later stage can read VendorCredit.Line[] /
-- VendorCredit.LinkedTxn[] without a second network round-trip.
--
-- Additive only. Idempotent (IF NOT EXISTS / DO guards / ON CONFLICT DO NOTHING). RLS by
-- operating_company_id (ENABLE + FORCE). GRANTed to ih35_app per the 0065 mdata convention
-- (SELECT, INSERT, UPDATE — never DELETE). Reversible: see DOWN section at file end.

BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_vendor_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  doc_number text,
  -- VendorRef: the vendor who issued the credit (QBO VendorCredit.VendorRef). Bridged to
  -- mdata.vendors.qbo_vendor_id by the projector; an unresolved vendor is SKIPPED, never invented.
  vendor_qbo_id text,
  vendor_name text,
  -- APAccountRef: the A/P control account the credit sits in (QBO VendorCredit.APAccountRef). Mirrored for
  -- reconciliation only — this path never resolves it into a TMS GL posting.
  ap_account_qbo_id text,
  ap_account_name text,
  txn_date date,
  total_cents bigint NOT NULL DEFAULT 0,
  -- QBO VendorCredit.Balance = the UNAPPLIED remainder of the credit (present on all 676 archived
  -- payloads). total_cents - balance_cents is therefore QuickBooks' OWN applied figure; the projector uses
  -- it for accounting.vendor_credits.amount_applied_cents rather than inventing an application amount.
  balance_cents bigint NOT NULL DEFAULT 0,
  currency text,
  private_note text,
  -- VendorCredit.LinkedTxn[] length. On prod these link to a BillPayment (TxnType='BillPayment'), NOT to a
  -- Bill, and carry NO per-bill amount — so accounting.vendor_credit_applications cannot be derived from
  -- them without fabricating money. Counted here so the honest gap is measurable instead of invisible.
  linked_txn_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  qbo_updated_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_qbo_vendor_credits_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_vendor_credits_company_vendor
  ON mdata.qbo_vendor_credits (operating_company_id, vendor_qbo_id);
CREATE INDEX IF NOT EXISTS ix_qbo_vendor_credits_company_txn_date
  ON mdata.qbo_vendor_credits (operating_company_id, txn_date);

ALTER TABLE mdata.qbo_vendor_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.qbo_vendor_credits FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_vendor_credits TO ih35_app;

-- Sync writer (lucia bypass) + opco-scoped read/write.
DROP POLICY IF EXISTS qbo_vendor_credits_company_scope ON mdata.qbo_vendor_credits;
CREATE POLICY qbo_vendor_credits_company_scope ON mdata.qbo_vendor_credits
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
DROP POLICY IF EXISTS qbo_vendor_credits_select_office ON mdata.qbo_vendor_credits;
CREATE POLICY qbo_vendor_credits_select_office ON mdata.qbo_vendor_credits
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

-- Register both stage flags in the catalog, DEFAULT OFF. isEnabled() resolves an absent row/override to
-- false, so an unregistered flag is already SAFE-OFF; these rows exist so a per-entity override has a FK
-- target (lib.feature_flag_overrides.flag_key REFERENCES lib.feature_flags).
DO $flags$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES
      (
        'QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED',
        'ACCT-F47 Stage 1: clone QuickBooks VendorCredits into the read-only mirror '
          || 'mdata.qbo_vendor_credits (upsert by qbo_id). Inbound reconcile-only; no GL; no TMS->QBO '
          || 'write. Resolved per-entity via lib.feature_flag_overrides. DEFAULT OFF.',
        false,
        0
      ),
      (
        'QBO_VENDOR_CREDITS_PROJECTION_ENABLED',
        'ACCT-F47 Stage 2: project the QBO VendorCredit mirror into accounting.vendor_credits '
          || '(qbo_id set, source_system=''qbo'') so the A/P vendor-credit subledger reflects '
          || 'QuickBooks'' real credits. SUBLEDGER ONLY, NO GL posting. Vendors that do not resolve to '
          || 'mdata.vendors.qbo_vendor_id are skipped, never invented. Resolved per-entity via '
          || 'lib.feature_flag_overrides. DEFAULT OFF.',
        false,
        0
      )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $flags$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT to_regclass('mdata.qbo_vendor_credits') IS NOT NULL) AS mirror_table_present,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'mdata.qbo_vendor_credits'::regclass) AS force_rls,
  (SELECT has_table_privilege('ih35_app', 'mdata.qbo_vendor_credits', 'DELETE')) AS app_can_delete, -- expect false
  (SELECT count(*) FROM lib.feature_flags
     WHERE flag_key IN ('QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED','QBO_VENDOR_CREDITS_PROJECTION_ENABLED')) AS flags_registered,
  (SELECT count(*) FROM lib.feature_flags
     WHERE flag_key IN ('QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED','QBO_VENDOR_CREDITS_PROJECTION_ENABLED')
       AND default_enabled = true) AS flags_default_on;  -- expect 0

-- DOWN (manual, owner-gated)
-- BEGIN;
-- DROP POLICY IF EXISTS qbo_vendor_credits_select_office ON mdata.qbo_vendor_credits;
-- DROP POLICY IF EXISTS qbo_vendor_credits_company_scope ON mdata.qbo_vendor_credits;
-- DROP TABLE IF EXISTS mdata.qbo_vendor_credits;
-- -- flag catalog rows may remain; they are SAFE-OFF without an ON override.
-- COMMIT;
