-- ACCT-F47 / ACCT-ECON-05 — additive QBO-origin columns + the projection idempotency key on
-- accounting.vendor_credits. Companion to 202610171200 (the mirror table + flags).
--
-- Ships via db:migrate on deploy. ADDITIVE ONLY: four nullable/defaulted columns and one partial unique
-- index. No column is dropped, retyped or narrowed; no row is written; no GL is posted.
--
-- WHY: the Stage-2 projector must be able to (a) mark which vendor credits QuickBooks owns and
-- (b) upsert them idempotently. Verified LIVE on Neon br-fancy-credit-akjnd07a 2026-07-29 —
-- accounting.vendor_credits has NO qbo_id, NO source_system, NO qbo_sync_token and NO
-- last_qbo_synced_at column, so today a projection would either duplicate on every sync tick or be
-- indistinguishable from an owner-entered credit. accounting.bills / bill_payments / payments all
-- already carry `source_system text NOT NULL DEFAULT 'tms'` + `qbo_sync_token` + `last_qbo_synced_at`
-- (verified on prod); this brings vendor_credits to the same shape rather than inventing a new one.
--
-- The partial unique index is the exact analogue of accounting.payments'
-- uq_payments_company_qbo_payment_id and accounting.expenses' uq_expenses_company_qbo_purchase_id:
-- one QBO VendorCredit == one accounting.vendor_credits row, per operating company.
--
-- NOT TOUCHED HERE (deliberately): display_id and its `^VC-[0-9]{4}-[0-9]{4}$` CHECK, the
-- amount_cents > 0 CHECK, the amount_applied_cents <= amount_cents CHECK, and the GENERATED ALWAYS
-- column amount_unapplied_cents. The projector conforms to all four; it does not relax them.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS). CI replays this on a fresh
-- DB from 0001 — no dependency on synced data, no RAISE.

BEGIN;

ALTER TABLE accounting.vendor_credits
  ADD COLUMN IF NOT EXISTS qbo_id text;

-- 'tms' for every owner-entered credit (the existing behaviour); 'qbo' only for projected mirror rows.
-- Safe as NOT NULL DEFAULT: Postgres backfills existing rows with the default, and prod currently holds
-- 0 vendor_credits rows (verified live under lucia bypass 2026-07-29).
ALTER TABLE accounting.vendor_credits
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms';

ALTER TABLE accounting.vendor_credits
  ADD COLUMN IF NOT EXISTS qbo_sync_token text;

ALTER TABLE accounting.vendor_credits
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz;

COMMENT ON COLUMN accounting.vendor_credits.qbo_id IS
  'QuickBooks VendorCredit.Id this row is the read-in projection of (NULL for owner-entered credits). '
  'Mirror of record: mdata.qbo_vendor_credits. Reconcile-only — TMS never writes back to QBO.';
COMMENT ON COLUMN accounting.vendor_credits.source_system IS
  'tms = owner-entered in TMS; qbo = projected from the QuickBooks VendorCredit mirror (no GL posted).';

-- Idempotency key for the QBO VendorCredit -> accounting.vendor_credits projection upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_credits_company_qbo_id
  ON accounting.vendor_credits (operating_company_id, qbo_id)
  WHERE qbo_id IS NOT NULL;

-- Vendor-scoped lookup of QBO-origin credits (the A/P vendor tab reads by vendor_id).
CREATE INDEX IF NOT EXISTS ix_vendor_credits_company_source_system
  ON accounting.vendor_credits (operating_company_id, source_system);

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'accounting' AND table_name = 'vendor_credits'
       AND column_name IN ('qbo_id','source_system','qbo_sync_token','last_qbo_synced_at')) AS qbo_columns_present, -- expect 4
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'accounting' AND tablename = 'vendor_credits'
       AND indexname = 'uq_vendor_credits_company_qbo_id') AS projection_key_present; -- expect 1

-- DOWN (manual, owner-gated — additive columns are normally KEPT per never-delete-only-add):
--   DROP INDEX IF EXISTS accounting.uq_vendor_credits_company_qbo_id;
--   DROP INDEX IF EXISTS accounting.ix_vendor_credits_company_source_system;
