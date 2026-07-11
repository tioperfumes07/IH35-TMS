-- 202607190000_qbo_connection_enumeration_security_definer.sql
-- [HOLD-FOR-JORGE — TIER 1 / MIGRATION] Let the QBO reconciler ENUMERATE active connections past company-RLS.
--
-- BUG (RECON-RLS-VISIBILITY, verified prod br-fancy-credit-akjnd07a 2026-07-10):
--   integrations.qbo_connections is FORCE ROW LEVEL SECURITY with policy qbo_connections_company_scope
--   = (operating_company_id::text = current_setting('app.operating_company_id', true)) — no lucia-bypass
--   clause. The reconciliation worker's listCompaniesForCategory('qbo') runs
--   `SELECT DISTINCT operating_company_id FROM integrations.qbo_connections WHERE revoked_at IS NULL`
--   inside withLuciaBypass but WITHOUT any app.operating_company_id set, so RLS hides EVERY row -> 0
--   companies enumerated -> QBO reconciliation never runs for any entity (2 active connections exist:
--   TRANSP + TRK). Chicken-and-egg: the job must see ALL active connections to know which companies to loop.
--
-- FIX (additive, root-cause; RLS is NOT weakened):
--   A SECURITY DEFINER function that returns ONLY the DISTINCT active operating_company_ids. It runs as the
--   function owner (the migration role, which owns the table / bypasses RLS) — the same proven pattern as
--   safety.ensure_company_safety_settings() and reports.refresh_lane_metrics_monthly(). Hardened
--   search_path. EXECUTE granted to ih35_app only. This elevates ONLY the id-enumeration; the per-company
--   reconciliation loop still `set_config('app.operating_company_id', ...)` before every row-data read, so
--   entity isolation on the actual reconciliation reads is unchanged. The qbo_connections policy + FORCE
--   state are untouched; no blanket BYPASSRLS is added.

BEGIN;

CREATE OR REPLACE FUNCTION integrations.list_active_qbo_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, integrations
AS $fn$
  SELECT DISTINCT operating_company_id
  FROM integrations.qbo_connections
  WHERE revoked_at IS NULL;
$fn$;

-- App role may EXECUTE the enumerator; it still cannot SELECT the raw table cross-entity (policy unchanged).
REVOKE ALL ON FUNCTION integrations.list_active_qbo_company_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION integrations.list_active_qbo_company_ids() TO ih35_app;

COMMIT;

-- ROLLBACK (owner-run only):
-- DROP FUNCTION IF EXISTS integrations.list_active_qbo_company_ids();
