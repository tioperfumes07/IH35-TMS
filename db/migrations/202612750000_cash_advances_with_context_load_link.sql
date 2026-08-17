BEGIN;

-- ACCT-F5408 — views.cash_advances_with_context (migration 0046) was created BEFORE
-- driver_finance.driver_advances.load_id existed (added later by migration
-- 202606251600_load_cash_advance_link.sql) and was never refreshed to select it. The view backs
-- GET /api/v1/cash-advances/:id — the ONLY read path for AdvanceDetailDrawer.tsx and
-- MarkDisbursedModal.tsx — so those two surfaces can never render a Linked Load EntityLink no
-- matter what data exists: the column is discarded at the view layer before it ever reaches the
-- API response. CreateAdvanceModal.tsx already writes load_id (required for purpose=lumper/
-- fuel_deposit, per cash-advances.routes.ts createAdvanceBodySchema) — the write path was always
-- correct; only the read-back view was stale. CREATE OR REPLACE VIEW cannot reorder/remove
-- existing output columns, so the two new columns are appended at the END of both the real and
-- empty-fallback SELECT lists (never inserted mid-list).
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
        b.vendor_id AS linked_bill_vendor_id,
        a.load_id,
        ld.load_number AS load_display_id
      FROM driver_finance.driver_advances a
      JOIN mdata.drivers d ON d.id = a.driver_id
      LEFT JOIN driver_finance.driver_liabilities l ON l.id = a.liability_id
      LEFT JOIN accounting.bills b ON b.id = a.linked_bill_id
      LEFT JOIN mdata.loads ld ON ld.id = a.load_id
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
        NULL::uuid AS linked_bill_vendor_id,
        NULL::uuid AS load_id,
        NULL::text AS load_display_id
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;
