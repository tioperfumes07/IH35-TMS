-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] QBO-EXPENSES-PULL-2 — projection idempotency key + flags.
-- DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod db:migrate
-- HELD-SKIPs it. Registered in db/migrations/.held-migrations.json. Companion to 202607860000 (the mirror
-- table). GL is NOT posted by this path (QuickBooks owns GL for qbo-sourced rows).
--
-- WHAT:
--   1) A partial UNIQUE index on accounting.expenses (operating_company_id, qbo_purchase_id) so Stage 2
--      can idempotently upsert the QBO Purchase projection (mirrors accounting.bills'
--      uq_bills_company_qbo_bill_id used by the A/P projection). qbo_purchase_id already EXISTS on
--      accounting.expenses (migration 202606151300) but was never uniquely constrained.
--   2) Register the two default-OFF feature flags in lib.feature_flags so isEnabled() has catalog rows to
--      resolve (returns false when a row/override is absent — SAFE-OFF).
--
-- BUILD-AND-HOLD: unlike the A/P pull migration (202607390000), this migration DOES NOT seed any
-- per-entity ON override. The flags stay OFF for every entity until the OWNER flips them ON per-entity in
-- lib.feature_flag_overrides (financial governance action, recorded as the owner's approval). The
-- companion backfill script (scripts/ops/backfill-qbo-purchases-expenses.mjs) is owner-run after the flip.
--
-- CI-SAFE / fresh-DB replay: the index is partial + IF NOT EXISTS; the flag rows have no FK dependency
-- and always seed. Idempotent. Additive only.

BEGIN;

-- 1) Idempotency key for the QBO Purchase -> accounting.expenses projection upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_company_qbo_purchase_id
  ON accounting.expenses (operating_company_id, qbo_purchase_id)
  WHERE qbo_purchase_id IS NOT NULL;

-- 2) Register both flags in the catalog, DEFAULT OFF. isEnabled() returns false when a row/override is
--    absent, so this is SAFE-OFF; the OWNER adds the per-entity ON overlay later (build-and-HOLD).
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES
      (
        'QBO_PURCHASES_MIRROR_PULL_ENABLED',
        'QBO-EXPENSES-PULL Stage 1: clone QuickBooks Purchases into the read-only mirror '
          || 'mdata.qbo_purchases (upsert by qbo_id). Inbound reconcile-only; no GL. Resolved per-entity '
          || 'via overrides. OFF by default (owner flips ON per-entity).',
        false,
        0
      ),
      (
        'QBO_EXPENSES_PROJECTION_ENABLED',
        'QBO-EXPENSES-PULL Stage 2/2b: project the QBO Purchase mirror into accounting.expenses '
          || '(qbo_purchase_id set) + accounting.expense_lines so the expense subledger reflects '
          || 'QuickBooks'' real cash/card spend. Subledger only, NO GL posting (posting_status stays '
          || '''unposted''). Resolved per-entity via overrides. OFF by default (owner flips ON per-entity).',
        false,
        0
      )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'accounting' AND tablename = 'expenses'
       AND indexname = 'uq_expenses_company_qbo_purchase_id') AS projection_key_present,
  (SELECT count(*) FROM lib.feature_flags
     WHERE flag_key IN ('QBO_PURCHASES_MIRROR_PULL_ENABLED','QBO_EXPENSES_PROJECTION_ENABLED')) AS flags_registered,
  (SELECT count(*) FROM lib.feature_flag_overrides
     WHERE flag_key IN ('QBO_PURCHASES_MIRROR_PULL_ENABLED','QBO_EXPENSES_PROJECTION_ENABLED')
       AND enabled = true) AS entity_overrides_on;  -- expected 0 until owner flips ON

-- ROLLBACK (manual, owner-gated):
--   DROP INDEX IF EXISTS accounting.uq_expenses_company_qbo_purchase_id;
--   -- flag catalog rows may remain; they are SAFE-OFF without an ON override.
