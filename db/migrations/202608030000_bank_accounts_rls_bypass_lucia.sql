-- DO NOT RUN ON PROD — [HOLD-FOR-JORGE — FINANCIAL CLUSTER / RLS-POLICY CHANGE]
--
-- BANK-ECON-04 / BANK-SURF-04 ROOT CAUSE — reconciliation "start session" active-path fix.
--
-- PROVEN (local migrated Postgres, this PR's integration test
-- apps/backend/src/banking/__tests__/reconciliation-start-session-live-path.integration.test.ts —
-- and consistent with prod: 16 live banking.bank_accounts rows, ZERO banking.reconciliation_sessions
-- rows, ZERO audit.audit_events rows for event_class LIKE 'banking.reconciliation%', Neon lucia bypass
-- 2026-07-24/25):
--
--   POST /api/v1/banking/reconciliation/start and POST /api/v1/banking/upload-statement (both entry
--   points a real operator reaches — BankingHome "+ Start first reconciliation"/"+ Reconcile", and the
--   ReconciliationWorkspace inline "Create Session" form) do NOT know which operating_company_id a bare
--   bank_account_id belongs to until they look the row up — that lookup runs through withLuciaBypass
--   (apps/backend/src/auth/db.ts), which sets app.bypass_rls='lucia' AND OVERWRITES
--   app.operating_company_id with the all-zeros sentinel (LUCIA_BYPASS_SENTINEL_COMPANY_ID).
--
--   banking.bank_accounts' ONLY RLS policy (bank_accounts_company_scope, migration 0072) is:
--       USING (operating_company_id::text = current_setting('app.operating_company_id', true))
--   — it has NO app.bypass_rls escape. ih35_app has rolbypassrls=false (verified), so RLS genuinely
--   applies. Every SELECT ... WHERE id = $1 under the sentinel operating_company_id therefore matches
--   ZERO rows for EVERY real bank account, for EVERY operator, on EVERY attempt — the route's very next
--   line (`if (!accountContext) return reply.code(404)...`) always fires. The route is fully mounted,
--   the button is fully wired, the INSERT statement is correct, and #3417's zero-diff completion logic
--   is correct and dead — every attempt 404s with bank_account_not_found before a row can ever be
--   inserted. This is why reconciliation_sessions has been 0 since table creation (0075), not an
--   ops-empty fact.
--
--   Exact precedent for this defect class + fix (READ-ONLY escape on a table withLuciaBypass must read
--   before an operating_company_id is known): 202607610000_qbo_connections_rls_bypass_escape.sql
--   ("a retrofit gap, not a deliberate security decision") and 202607900000_coa_roles_rls_bypass_lucia.sql.
--   Mirrored exactly here, narrowly, for exactly the one table proven broken.
--
-- WHY THIS IS THE CORRECT FIX AND NOT A HOLE PUNCHED IN THE POLICY LAYER:
--   * The escape is added to USING (read visibility) ONLY. WITH CHECK is UNCHANGED — this migration
--     grants NO new write authority. Every writer of banking.bank_accounts already sets the REAL
--     operating_company_id via withCompanyScope before writing (see reconciliation.routes.ts,
--     transfers.service.ts, bank-account-visibility.ts) and therefore still satisfies the unchanged
--     WITH CHECK.
--   * ih35_app already holds SELECT/INSERT/UPDATE on this table; this changes WHICH ROWS a
--     bypass-context read sees, not whether the role may touch the table at all.
--   * Scope is exactly the ONE table proven broken (banking.bank_accounts). banking.reconciliation_sessions
--     itself is untouched — every read/write on it already runs through withCompanyScope with a REAL
--     company id resolved by that point (never through withLuciaBypass), so its policy needs no change.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Additive: no data change, no column change, no grant
-- change, no DELETE. Rollback = re-create the policy without the escape clause.
--
-- Financial cluster (RLS policy on a bank/money table) — OWNER APPLIES on a Neon branch, then
-- ledger-backfills. Never self-merge, never auto-apply to prod.

BEGIN;

DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NULL THEN
    RAISE NOTICE 'banking.bank_accounts absent — skipping (fresh-DB CI ordering)';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS bank_accounts_company_scope ON banking.bank_accounts;

  CREATE POLICY bank_accounts_company_scope
    ON banking.bank_accounts
    FOR ALL
    TO ih35_app
    USING (
      (operating_company_id)::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    WITH CHECK (
      -- UNCHANGED on purpose: writes stay strictly entity-scoped. No new write authority.
      (operating_company_id)::text = current_setting('app.operating_company_id', true)
    );
END
$$;

COMMIT;
