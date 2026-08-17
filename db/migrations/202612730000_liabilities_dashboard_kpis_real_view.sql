-- FINDING: LV-LIABILITIES-DASHBOARD-KPIS-EMPTY-STUB (carries ACCT-F5400) — found live 2026-08-17 while
-- performing the assigned settlements Wave D1 live-verify of the `liabilities.list` leaf.
--
-- SIBLING OF ACCT-F272 / FAIL-DD2 (migration 202612440000_liabilities_active_view_real_columns.sql).
-- Migration 0045_p3_t11_10_safety_liabilities.sql wrapped BOTH views it created —
-- views.liabilities_active_with_context AND views.liabilities_dashboard_kpis — in the identical guard:
--   IF driver_finance.driver_liabilities has column acknowledgment_uuid THEN <real view> ELSE <empty
--   stub, "WHERE false", zero rows ever> END IF.
-- Prod never had acknowledgment_uuid (nor forfeiture_clause_active/forfeiture_clause_signed_at/
-- spawned_from_event_id — see 202612440000's header for the full column audit). Both views therefore
-- fell into the ELSE branch and became permanent empty stubs. 202612440000 fixed
-- liabilities_active_with_context by rebuilding it from the columns prod actually has — but its sibling
-- liabilities_dashboard_kpis was never patched and is still the dead stub today.
--
-- LIVE-MEASURED 2026-08-17: selected-USMCA /liabilities showed "TOTAL ACTIVE DEBT: 0" and "DRIVERS W/
-- DEBT: 0" in the KPI strip directly above a table listing 2 real active liabilities (SAMPLE
-- Cascade-2042 loan $100.00, ALFONSO HIDALGO CHAVEZ advance $250.00 — the exact same two rows
-- 202612440000's own header already named as "real and healthy" and "invisible... not because of
-- anything about the row"). GET /api/v1/liabilities/dashboard/kpis returns zero rows for USMCA from the
-- stub view, so apps/backend/src/liabilities/liabilities.routes.ts's fallback (hardcoded
-- total_active_debt: 0 etc.) is what actually renders — the same self-contradictory
-- KPI-disagrees-with-its-own-list-below shape as ACCT-F5399 (factoring), just upstream at the view
-- layer instead of the route fallback layer.
--
-- FIX: rebuild views.liabilities_dashboard_kpis using ONLY the columns 202612440000 already verified
-- present on prod (id, operating_company_id, driver_id, type, source_description, original_amount,
-- paid_to_date, current_balance, requires_acknowledgment, origin, origin_id, reference_doc_id, status,
-- created_at, updated_at). pending_acks previously required acknowledgment_uuid — that column does not
-- exist, so per the same honesty policy 202612440000 already established ("acknowledgement state is
-- not merely unknown — it is unrecorded... surfaced as NULL rather than inventing it"), pending_acks is
-- emitted as NULL here too, not fabricated from requires_acknowledgment alone. The FE's
-- LiabilitiesKpiRow.tsx already renders an absent/NULL KPI as "—", not "0" — this migration does not
-- touch the FE, the existing honest-absence contract is already correct and unchanged.
--
-- DROP + CREATE (not CREATE OR REPLACE): same reason as 202612440000 — the stub view typed every
-- numeric column as unconstrained `numeric`/`bigint`; changing a view column's type requires DROP+CREATE
-- in Postgres. No dependents on this view (same class as its sibling; verified no FK/trigger references
-- a Postgres view).
--
-- Idempotent: guarded by driver_finance.driver_liabilities existing. Additive: no data row touched, no
-- account, no GL. Pure read-model rebuild.

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NULL THEN
    RAISE NOTICE 'ACCT-F5400: driver_finance.driver_liabilities absent — view not rebuilt';
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS views.liabilities_dashboard_kpis';

  EXECUTE $VIEW$
    CREATE VIEW views.liabilities_dashboard_kpis
    WITH (security_invoker = true) AS
    SELECT
      operating_company_id,
      SUM(current_balance) FILTER (WHERE current_balance > 0) AS total_active_debt,
      COUNT(DISTINCT driver_id) FILTER (WHERE current_balance > 0) AS drivers_with_debt,
      NULL::bigint AS pending_acks,
      SUM(original_amount) FILTER (
        WHERE type = 'equipment_loss'
          AND created_at >= date_trunc('year', now())
      ) AS equipment_loss_ytd,
      SUM(original_amount) FILTER (
        WHERE type = 'civil_fine'
          AND created_at >= date_trunc('year', now())
      ) AS civil_fines_ytd
    FROM driver_finance.driver_liabilities
    GROUP BY operating_company_id
  $VIEW$;
END
$$;

-- Drift-capture signal: expect at least 1 row for USMCA on prod (2 active liabilities, $350.00
-- combined) after this migration; 0 rows total is only expected on bare CI (no seeded liabilities).
SELECT count(*) AS liabilities_dashboard_kpis_rows FROM views.liabilities_dashboard_kpis;
