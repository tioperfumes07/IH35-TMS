-- FINDING: SETTLE-DEBT-VIEW-STUB
-- Prod `views.driver_settlement_with_debt` was the empty stub (`WHERE false`) from
-- migration 0042/0123's ELSE branch. Root cause: the IF branch referenced
-- `deduction_schedule.requires_acknowledgment` / `acknowledgment_uuid`, which do
-- not exist on that table — so the real view never stayed installed and every
-- GET /driver-finance/settlements/:id 404'd (list also empty).
-- Fix: recreate the view from driver_settlements + drivers; pending-ack EXISTS
-- uses driver_liabilities (has requires_acknowledgment + status='pending_ack').
-- Idempotent DROP + CREATE (CREATE OR REPLACE cannot change numeric→numeric(14,2)).

BEGIN;

DROP VIEW IF EXISTS views.driver_settlement_with_debt;

CREATE VIEW views.driver_settlement_with_debt
  WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.driver_id,
  s.period_start,
  s.period_end,
  s.status,
  s.gross_pay,
  s.deductions_total,
  s.reimbursements_total,
  s.net_pay,
  s.acknowledged_at,
  s.acknowledged_by_user_id,
  s.locked_at,
  s.paid_at,
  s.paid_via_bank_txn_id,
  concat_ws(' ', d.first_name, d.last_name) AS driver_full_name,
  d.id::text AS driver_display_id,
  EXISTS (
    SELECT 1
    FROM driver_finance.driver_liabilities l
    WHERE l.driver_id = s.driver_id
      AND l.requires_acknowledgment = true
      AND l.status = 'pending_ack'
  ) AS has_pending_acks
FROM driver_finance.driver_settlements s
JOIN mdata.drivers d ON d.id = s.driver_id;

COMMIT;
