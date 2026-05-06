BEGIN;

CREATE SCHEMA IF NOT EXISTS views;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_advances') IS NOT NULL
     AND to_regclass('driver_finance.driver_liabilities') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.cash_advances_with_context
      WITH (security_invoker = true) AS
      SELECT
        a.id,
        a.operating_company_id,
        a.display_id,
        a.driver_id,
        a.amount,
        a.purpose,
        a.disbursement_method,
        a.disbursement_status,
        a.disbursed_at,
        a.recipient_type,
        a.recipient_name,
        a.linked_bill_id,
        a.linked_bank_txn_id,
        a.linked_bill_payment_id,
        a.requires_owner_approval,
        a.approved_at,
        a.approved_by_user_id,
        a.created_at,
        a.created_by_user_id,
        l.current_balance AS outstanding_balance,
        l.id AS liability_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
        d.id::text AS driver_display_id,
        COALESCE(b.display_id, b.id::text) AS linked_bill_display_id,
        b.vendor_id AS linked_bill_vendor_id
      FROM driver_finance.driver_advances a
      JOIN mdata.drivers d ON d.id = a.driver_id
      LEFT JOIN driver_finance.driver_liabilities l ON l.id = a.liability_id
      LEFT JOIN accounting.bills b ON b.id = a.linked_bill_id
      ORDER BY a.created_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.cash_advances_with_context
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS operating_company_id,
        NULL::text AS display_id,
        NULL::uuid AS driver_id,
        NULL::numeric AS amount,
        NULL::text AS purpose,
        NULL::text AS disbursement_method,
        NULL::text AS disbursement_status,
        NULL::timestamptz AS disbursed_at,
        NULL::text AS recipient_type,
        NULL::text AS recipient_name,
        NULL::uuid AS linked_bill_id,
        NULL::uuid AS linked_bank_txn_id,
        NULL::uuid AS linked_bill_payment_id,
        false AS requires_owner_approval,
        NULL::timestamptz AS approved_at,
        NULL::uuid AS approved_by_user_id,
        NULL::timestamptz AS created_at,
        NULL::uuid AS created_by_user_id,
        NULL::numeric AS outstanding_balance,
        NULL::uuid AS liability_id,
        NULL::text AS driver_full_name,
        NULL::text AS driver_display_id,
        NULL::text AS linked_bill_display_id,
        NULL::uuid AS linked_bill_vendor_id
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

CREATE OR REPLACE VIEW views.cash_advances_dashboard_kpis
WITH (security_invoker = true) AS
SELECT
  operating_company_id,
  SUM(outstanding_balance) AS total_outstanding,
  SUM(amount) FILTER (WHERE disbursed_at >= date_trunc('month', now())) AS mtd_disbursed,
  COUNT(*) FILTER (WHERE disbursement_status = 'pending_approval') AS pending_approval,
  AVG(amount) AS avg_per_advance,
  COUNT(DISTINCT driver_id) FILTER (WHERE outstanding_balance > 0) AS drivers_with_active
FROM views.cash_advances_with_context
GROUP BY operating_company_id;

COMMIT;
