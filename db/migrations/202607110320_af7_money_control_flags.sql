-- [HOLD-FOR-JORGE — TIER 1] AF-7 — money-control flag infra (void/reversal + period-close gates).
-- DO NOT RUN ON PROD until Jorge says "OK to merge" (financial cluster: accounting.periods RLS policy
-- change + new flags). Runs only on a Neon branch first; ledger-backfilled at merge.
--
-- WHY: docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/AF-7-money-controls.txt — "money-control flags: OFF
-- until CPA tie-out" (locked, docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md line 31). This PR wires the
-- FLAG infra only; NO posting is turned on and NO new void/reversal/close UX ships here (that is the rest
-- of AF-7, a separate build). Two things:
--   1. Three per-entity-only flags (all default OFF): MONEY_CONTROL_VOID_REVERSAL_ENABLED (future
--      void/reversing-JE UX kill switch), MONEY_CONTROL_PERIOD_CLOSE_ENABLED (gates who may transition
--      accounting.periods to 'closed' via the app layer — the DB trigger in 0183 already blocks *posting
--      into* a closed period unconditionally; this flag is the separate app-level control over the close
--      ACTION itself), MONEY_CONTROL_PERIOD_REOPEN_ENABLED (reserves a future reopen action — no reopen
--      code exists yet; shipping the flag OFF now means a later reopen feature is born gated, never born
--      open).
--   2. Financial RLS gap fix on accounting.periods (created by 0183 with a FOR ALL policy that scopes by
--      entity only — ANY user with entity access could INSERT/UPDATE a period, i.e. close one, with no
--      role check at all). This migration splits the policy: SELECT stays entity-scoped for every role;
--      INSERT/UPDATE additionally requires identity.current_user_role() IN ('Owner','Administrator') —
--      matching the canonical Owner/Administrator-only write pattern used across the void/cancel
--      governance surfaces (identity.current_user_role(), migrations 0006/0007/0009 lineage).
-- Idempotent (ON CONFLICT / DROP+CREATE POLICY). No data touched. No posting math. Flags OFF.
-- Reversible: DROP the 3 flag rows; revert accounting.periods to the single FOR-ALL policy from 0183.

BEGIN;

-- ── 1. Three per-entity-only money-control flags, all default OFF. ─────────────────────────────────────
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES
  (
    'MONEY_CONTROL_VOID_REVERSAL_ENABLED',
    'AF-7: kill switch for the void/reversing-JE UX (correct GL effect, audit trail, reverse-never-'
    || 'hard-delete). DEFAULT OFF until CPA tie-out. Per-entity owner-gated only.',
    false, 0
  ),
  (
    'MONEY_CONTROL_PERIOD_CLOSE_ENABLED',
    'AF-7: app-level gate on the accounting.periods CLOSE action (transitioning a period to ''closed''). '
    || 'Independent of the DB trigger (accounting.raise_if_txn_in_closed_period, migration 0183) which '
    || 'already unconditionally blocks POSTING into a closed period — this flag controls who may perform '
    || 'the close ACTION itself once a close UX ships. DEFAULT OFF. Per-entity owner-gated only.',
    false, 0
  ),
  (
    'MONEY_CONTROL_PERIOD_REOPEN_ENABLED',
    'AF-7: reserves the (not-yet-built) period-REOPEN action. No reopen code path exists yet; this flag '
    || 'ships the control OFF now so reopen is born gated, never born open. DEFAULT OFF. Per-entity '
    || 'owner-gated only.',
    false, 0
  )
ON CONFLICT (flag_key) DO NOTHING;

-- ── 2. Financial RLS gap fix: accounting.periods write (close/reopen) requires Owner/Administrator. ────
--    0183 shipped a single FOR ALL policy with only the entity predicate — any entity-scoped user could
--    INSERT/UPDATE a period (close it) with zero role check. Split into SELECT (entity-only, every role
--    keeps read access to period status) and INSERT/UPDATE (entity + Owner/Administrator).
DROP POLICY IF EXISTS accounting_periods_company_scope ON accounting.periods;
DROP POLICY IF EXISTS accounting_periods_select ON accounting.periods;
DROP POLICY IF EXISTS accounting_periods_write ON accounting.periods;
DROP POLICY IF EXISTS accounting_periods_update ON accounting.periods;

CREATE POLICY accounting_periods_select ON accounting.periods
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

CREATE POLICY accounting_periods_write ON accounting.periods
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator')
    )
  );

CREATE POLICY accounting_periods_update ON accounting.periods
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator')
    )
  );

COMMIT;
