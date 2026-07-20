-- D-#1 RECON-COLLECTOR — restore background-job visibility of QBO connections.
--
-- ROOT CAUSE (proven on prod branch br-fancy-credit-akjnd07a, 2026-07-19):
--   integrations.qbo_connections is FORCE RLS with a single policy whose USING clause is
--       (operating_company_id)::text = current_setting('app.operating_company_id', true)
--   and NO `app.bypass_rls = 'lucia'` escape. Every background job runs inside withLuciaBypass
--   (apps/backend/src/auth/db.ts:158-183), which sets app.bypass_rls='lucia' AND overwrites
--   app.operating_company_id with a SENTINEL company id. Because this policy ignores the bypass
--   GUC, listQboConnectedOperatingCompanies() returns ZERO rows even though two healthy, actively
--   refreshing connections exist. The collector then takes its "no active QBO connections" branch,
--   returns cleanly, and wrapBackgroundJobTick records SUCCESS — a silent no-op that has reported
--   green while collecting nothing. accounting.qbo_remote_counts has held 3 rows since 2026-06-03.
--
--   Corroboration: reconciliation.qbo_transactional and reconciliation.qbo_refdata both fail with
--   "QBO reconciliation cannot run: 0 active qbo_connections" against the same two live connections.
--   ih35_app has rolbypassrls = false, so RLS genuinely applies to the runtime role; a SELECT with a
--   non-matching app.operating_company_id was measured returning 0 rows.
--
-- WHY THIS IS THE CORRECT FIX AND NOT A HOLE PUNCHED IN THE POLICY LAYER:
--   The GUC-escape IS this system's intended service-context pattern — 138 opco-scoped tables already
--   carry it, INCLUDING both tables this very feature writes to (accounting.qbo_remote_counts and
--   accounting.qbo_remote_count_collection_state, migration 0201). Migration 0201's author applied the
--   pattern to the tables they created; integrations.qbo_connections predates that work and was never
--   retrofitted. This is a retrofit gap, not a deliberate security decision.
--
-- SECURITY — deliberately minimal, and narrower than the 0201 pattern:
--   * The escape is added to USING (read visibility) ONLY. WITH CHECK is left UNCHANGED, so this
--     migration grants NO new write authority. Every existing writer (refreshAccessToken,
--     getValidAccessToken, stampRefreshFailure) already sets the REAL operating_company_id before
--     writing and therefore satisfies the unchanged WITH CHECK.
--   * ih35_app ALREADY holds SELECT on this table; this changes WHICH ROWS a service context sees,
--     not whether the role may read the table at all.
--   * Scope is exactly ONE table. A prod audit found 379 of 517 opco-scoped tables missing this
--     escape; that population is deliberately NOT touched here. Whether each is a live defect requires
--     a call-site→table mapping, tracked as a separate owner-gated block. No blanket policy change.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Additive: no data change, no column change, no grant
-- change, no DELETE. Rollback = re-create the policy without the escape clause.
--
-- [FINANCIAL-CLUSTER / RLS-POLICY CHANGE — OWNER APPLIES. DO NOT SELF-MERGE. §1.3/§1.4]

BEGIN;

DO $$
BEGIN
  IF to_regclass('integrations.qbo_connections') IS NULL THEN
    RAISE NOTICE 'integrations.qbo_connections absent — skipping (fresh-DB CI ordering)';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS qbo_connections_company_scope ON integrations.qbo_connections;

  CREATE POLICY qbo_connections_company_scope
    ON integrations.qbo_connections
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
