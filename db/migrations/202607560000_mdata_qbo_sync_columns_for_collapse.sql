-- =====================================================================================================
-- [HOLD-FOR-JORGE — FINANCIAL] QBO dual-write collapse — STEP 1 (additive sync columns on mdata.qbo_*)
-- DO NOT RUN ON PROD via db:migrate. Runs on a Neon branch by Jorge's hand, then ledger-backfilled so
-- prod db:migrate skips it; CI (fresh-from-0001) applies it so Step-2's writer repoint + schema-parity
-- have the columns. Registered in db/migrations/.held-migrations.json.
-- =====================================================================================================
--
-- WHY: the QBO dual-write collapse repoints the push writers (sync/qbo-accounts-push.ts,
-- qbo-customers-push.ts, qbo-vendors-push.ts, onboarding/usmca-carrier-bootstrap.ts) off the RETIRE
-- accounting.qbo_* mirror onto the canonical mdata.qbo_* mirror (§10 LINKAGE LAW; opening-balance import
-- §2 mapping DEPENDS ON this collapse). The writers set the QBO push-status columns; mdata.qbo_* lacks
-- them. This adds ONLY the columns present on accounting.qbo_* but missing on mdata.qbo_* that the writers
-- use — verified against the prod Neon branch br-fancy-credit-akjnd07a (2026-07-16), mirroring the source
-- columns' types + defaults EXACTLY so the repointed writers behave identically.
--
-- SAFETY:
--   * ADDITIVE + IDEMPOTENT only (ADD COLUMN IF NOT EXISTS) — safe to run twice.
--   * Both mdata.qbo_* and accounting.qbo_* carry LIVE data (mdata is the fuller mirror: ~1651/2684/2776
--     rows vs ~1647/2655/2744). NOT-NULL-with-constant-default columns backfill existing rows instantly
--     (PG 11+ metadata-only) — every existing mdata.qbo_* row gets sync_status='unsynced', qbo_push_attempts=0,
--     eligible_1099=false. No data migration, no row rewrite.
--   * NO RLS / GRANT change (ADD COLUMN inherits the table's FORCED-RLS policies + ih35_app grants).
--   * Plain typed columns, no new cross-schema FKs (parent_id / *_qbo_id are self-ref / external-QBO ids —
--     accounting.qbo_* carries them FK-less too; baselined in verify-orphan-fk-inventory).
--
-- COLUMN MAP (source: accounting.qbo_* — exact type + default mirrored):
--   mdata.qbo_accounts  += parent_id uuid, parent_synced boolean, qbo_last_error text,
--                          qbo_last_push_at timestamptz, qbo_push_attempts int NOT NULL DEFAULT 0,
--                          sync_status text NOT NULL DEFAULT 'unsynced'
--   mdata.qbo_customers += qbo_last_error text, qbo_last_push_at timestamptz,
--                          qbo_push_attempts int NOT NULL DEFAULT 0, sync_status text NOT NULL DEFAULT 'unsynced'
--   mdata.qbo_vendors   += default_ap_account_qbo_id text, eligible_1099 boolean NOT NULL DEFAULT false,
--                          payment_terms_qbo_id text, qbo_last_error text, qbo_last_push_at timestamptz,
--                          qbo_push_attempts int NOT NULL DEFAULT 0, sync_status text NOT NULL DEFAULT 'unsynced'

ALTER TABLE mdata.qbo_accounts
  ADD COLUMN IF NOT EXISTS parent_id          uuid,
  ADD COLUMN IF NOT EXISTS parent_synced      boolean,
  ADD COLUMN IF NOT EXISTS qbo_last_error     text,
  ADD COLUMN IF NOT EXISTS qbo_last_push_at   timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_push_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_status        text    NOT NULL DEFAULT 'unsynced';

ALTER TABLE mdata.qbo_customers
  ADD COLUMN IF NOT EXISTS qbo_last_error     text,
  ADD COLUMN IF NOT EXISTS qbo_last_push_at   timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_push_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_status        text    NOT NULL DEFAULT 'unsynced';

ALTER TABLE mdata.qbo_vendors
  ADD COLUMN IF NOT EXISTS default_ap_account_qbo_id  text,
  ADD COLUMN IF NOT EXISTS eligible_1099              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_terms_qbo_id       text,
  ADD COLUMN IF NOT EXISTS qbo_last_error             text,
  ADD COLUMN IF NOT EXISTS qbo_last_push_at           timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_push_attempts          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_status                text    NOT NULL DEFAULT 'unsynced';
