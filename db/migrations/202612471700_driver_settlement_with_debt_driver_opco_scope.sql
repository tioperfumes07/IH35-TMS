-- FINDING: SETL-UI-API
-- views.driver_settlement_with_debt joined mdata.drivers by id only. Under security_invoker
-- the driver row must be entity-visible; co-scope the join to the settlement opco so list
-- queries cannot silently drop rows when driver RLS and settlement opco diverge.

BEGIN;

DROP VIEW IF EXISTS views.driver_settlement_with_debt;

CREATE VIEW views.driver_settlement_with_debt
  WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.display_id,
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
JOIN mdata.drivers d
  ON d.id = s.driver_id
 AND d.operating_company_id = s.operating_company_id;

GRANT SELECT ON views.driver_settlement_with_debt TO ih35_app;

COMMIT;
