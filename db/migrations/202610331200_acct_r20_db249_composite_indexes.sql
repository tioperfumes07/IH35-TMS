-- ACCT-R-20 / db249-index-optimization-3
-- Additive composite indexes for the three hot list/filter paths that still lack them.
-- Perf-only (no GL math, no RLS policy change, no column add). Financial-cluster only because
-- accounting.invoices DDL is in scope (§1.4) — build-and-HOLD; owner Neon-applies.
--
-- Neon Step-1 2026-07-31 (br-fancy-credit-akjnd07a, lucia):
--   safety.safety_events       — has (opco, subject_driver_id) and (opco, occurred_at) separately;
--                                missing (opco, subject_driver_id, occurred_at)
--   accounting.invoices        — has (customer_id, issue_date); missing (customer_id, status, issue_date)
--   maintenance.work_orders    — has (unit_id) and (opco, status); missing (unit_id, status, opened_at)
--
-- Idempotent: CREATE INDEX IF NOT EXISTS. Fresh-DB-safe (tables exist from earlier migrations).

CREATE INDEX IF NOT EXISTS idx_safety_events_company_driver_occurred
  ON safety.safety_events (operating_company_id, subject_driver_id, occurred_at DESC)
  WHERE subject_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status_issue_date
  ON accounting.invoices (customer_id, status, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_orders_unit_status_opened
  ON maintenance.work_orders (unit_id, status, opened_at DESC)
  WHERE unit_id IS NOT NULL;
