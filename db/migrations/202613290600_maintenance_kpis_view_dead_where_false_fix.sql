-- GO-1405 P1 (owner packet IH35-FINISH-2026-08-29/CC-1): views.maintenance_dashboard_kpis has
-- been a permanent `SELECT ... WHERE false` stub since 0041_p3_t11_6_maintenance_rebuild.sql --
-- that migration's schema-detection branch looked for a total_estimated_cost or total_cost
-- column on maintenance.work_orders; neither name was ever used (the table's real cost columns
-- are total_actual_cost / estimated_cost_cents / actual_cost_cents / parts_cost_cents), so it
-- silently fell into the empty fallback branch and was never revisited. Every dashboard field
-- sourced from this view (mtd_repair_cost, in_shop, avg_wo_age_days, avg_wo_cost) has therefore
-- always read as 0 regardless of real work-order data. Live proof: 3 completed August 2026 work
-- orders (wo_type=repair, opened_at in August, total_actual_cost 110.00/110.00/125.00) produce
-- mtd_repair_cost=0 today.
--
-- This migration replaces the view with a real one over the table's actual cost columns,
-- reusing the exact cost-fallback expression already used by getCriticalWorkOrderKpis() in
-- apps/backend/src/maintenance/dashboard-kpis.routes.ts (COALESCE(total_actual_cost,
-- COALESCE(estimated_cost_cents, 0)::numeric / 100.0)) for consistency, and adds a voided_at
-- exclusion the original definition never had (void-not-delete law).
--
-- in_shop keeps the original status='in_progress' filter: maintenance.work_orders live status
-- vocabulary today is only 'complete'/'open' (a separate, pre-existing WO-status-vocabulary
-- gap out of this fix's scope -- filed on the board, not silently patched here), so in_shop
-- will read 0 for the same reason 'in_progress'/'waiting_parts' already read 0 elsewhere on
-- this same dashboard payload. That is unchanged behavior, not a regression introduced here.
--
-- security_invoker=true is set explicitly (CLAUDE.md S2 invariant, enforced generically by
-- 202606271500_f3_views_security_invoker.sql) rather than relied upon implicitly.
--
-- Idempotent: CREATE OR REPLACE VIEW; safe to re-run. No data mutated, no grant change.

CREATE OR REPLACE VIEW views.maintenance_dashboard_kpis
WITH (security_invoker = true) AS
SELECT
  operating_company_id,
  COUNT(*) FILTER (
    WHERE status NOT IN ('complete', 'cancelled')
      AND voided_at IS NULL
  ) AS open_wos,
  COUNT(*) FILTER (
    WHERE status = 'in_progress'
      AND repair_location = 'in_house'
      AND voided_at IS NULL
  ) AS in_shop,
  AVG(EXTRACT(epoch FROM (now() - opened_at)) / 86400) FILTER (
    WHERE status NOT IN ('complete', 'cancelled')
      AND voided_at IS NULL
  ) AS avg_wo_age_days,
  SUM(COALESCE(total_actual_cost, COALESCE(estimated_cost_cents, 0)::numeric / 100.0)) FILTER (
    WHERE wo_type = 'repair'
      AND opened_at >= date_trunc('month', now())
      AND voided_at IS NULL
  ) AS mtd_repair_cost,
  AVG(COALESCE(total_actual_cost, COALESCE(estimated_cost_cents, 0)::numeric / 100.0)) FILTER (
    WHERE status = 'complete'
      AND opened_at >= date_trunc('month', now())
      AND voided_at IS NULL
  ) AS avg_wo_cost
FROM maintenance.work_orders
GROUP BY operating_company_id;
