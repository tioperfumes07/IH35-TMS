-- FIN-20 follow-up — TRUE historical as-of AR/AP aging (table functions).
--
-- WHY: views.ar_aging / views.ap_aging bucket open balances at CURRENT_DATE off the live
-- snapshot columns (invoices.amount_open_cents, bills.paid_cents). That snapshot can only ever
-- answer "open NOW" — it cannot answer "what was open as of last month-end" (the report QBO /
-- NetSuite provide and the real fix FIN-20 #1643 deferred when it pinned the as-of picker to today).
--
-- These two table functions RECONSTRUCT each invoice/bill's open balance AS OF an arbitrary past
-- date from the dated application rows that already exist:
--   • AR: accounting.payment_applications.amount_cents, dated by the parent
--         accounting.payments.payment_date (the economic receipt date), with point-in-time
--         awareness of payment voids (payments.voided_at) and application reversals
--         (payment_applications.unapplied_at). open_as_of = total_cents − Σ(applied on/before as_of).
--   • AP: accounting.bill_payments.amount_cents, dated by bill_payments.payment_date, with
--         point-in-time awareness of payment revocations (bill_payments.revoked_at).
--         open_as_of = amount_cents − Σ(paid on/before as_of).
--
-- Buckets key on (as_of − due_date): current / 1-30 / 31-60 / 61-90 / 91+ (QBO-standard) — identical
-- to views.ar_aging / views.ap_aging but with the supplied as_of substituted for CURRENT_DATE.
--
-- PARITY BOUNDARIES (documented, deliberate — these match the EXISTING live views, which also
-- exclude them, so as_of = today reproduces today's view numbers):
--   • Credit-memo → invoice application carries NO per-application date in the schema
--     (accounting.credit_memos has related_invoice_id + a running amount_applied_cents only, no
--     dated application-event rows). It also does not feed the live invoices.amount_open_cents
--     (the recompute trigger reads only payment_applications). It is therefore out of scope here;
--     reconstructing it historically would require a dated credit_memo_applications table that does
--     not yet exist. Vendor-credit application (accounting.vendor_credits) is likewise undated.
--   • Invoices in status 'draft'/'factored' and bills already settled are excluded the same way the
--     live views exclude them. Status history is not tracked, so the reconstruction keys on the
--     dated money movement (payments/bill_payments) + issue/bill date, not on historical status.
--
-- READ-ONLY: CREATE OR REPLACE FUNCTION only — no CREATE TABLE / ALTER. Idempotent (re-runnable).
-- Opco-scoped via the p_opco parameter (defense-in-depth on top of RLS, which still applies because
-- these are SECURITY INVOKER). NULLIF concern N/A: no current_setting()::uuid cast is used (the
-- operating company is an explicit typed parameter). GRANT EXECUTE to ih35_app.

BEGIN;

-- ============================================================
-- accounting.ar_aging_as_of(opco, as_of) — AR aging by customer, open balance AS OF as_of.
-- ============================================================
CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(p_opco uuid, p_as_of date)
RETURNS TABLE (
  customer_id          uuid,
  customer_name        text,
  open_invoice_count   bigint,
  current_cents        bigint,
  bucket_1_30_cents    bigint,
  bucket_31_60_cents   bigint,
  bucket_61_90_cents   bigint,
  bucket_91_plus_cents bigint,
  total_open_cents     bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH inv AS (
    SELECT
      i.id,
      i.customer_id,
      i.due_date,
      i.total_cents,
      COALESCE((
        SELECT SUM(pa.amount_cents)
        FROM accounting.payment_applications pa
        JOIN accounting.payments p ON p.id = pa.payment_id
        WHERE pa.invoice_id = i.id
          AND p.payment_date <= p_as_of
          AND (p.voided_at IS NULL OR p.voided_at::date > p_as_of)
          AND (pa.unapplied_at IS NULL OR pa.unapplied_at::date > p_as_of)
      ), 0)::bigint AS paid_as_of
    FROM accounting.invoices i
    WHERE i.operating_company_id = p_opco
      AND i.issue_date <= p_as_of
      AND i.status NOT IN ('draft', 'factored')
      AND (i.voided_at IS NULL OR i.voided_at::date > p_as_of)
  ),
  open_inv AS (
    SELECT
      inv.customer_id,
      inv.due_date,
      GREATEST(inv.total_cents - inv.paid_as_of, 0)::bigint AS open_cents
    FROM inv
    WHERE GREATEST(inv.total_cents - inv.paid_as_of, 0) > 0
  )
  SELECT
    oi.customer_id,
    COALESCE(c.customer_name, '')::text AS customer_name,
    COUNT(*)::bigint AS open_invoice_count,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date >= p_as_of), 0)::bigint AS current_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of AND oi.due_date >= p_as_of - 30), 0)::bigint AS bucket_1_30_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of - 30 AND oi.due_date >= p_as_of - 60), 0)::bigint AS bucket_31_60_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of - 60 AND oi.due_date >= p_as_of - 90), 0)::bigint AS bucket_61_90_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of - 90), 0)::bigint AS bucket_91_plus_cents,
    COALESCE(SUM(oi.open_cents), 0)::bigint AS total_open_cents
  FROM open_inv oi
  JOIN mdata.customers c ON c.id = oi.customer_id
  GROUP BY oi.customer_id, c.customer_name;
$$;

-- ============================================================
-- accounting.ap_aging_as_of(opco, as_of) — AP aging by vendor, open balance AS OF as_of.
-- ============================================================
CREATE OR REPLACE FUNCTION accounting.ap_aging_as_of(p_opco uuid, p_as_of date)
RETURNS TABLE (
  vendor_id            text,
  vendor_name          text,
  open_bill_count      bigint,
  current_cents        bigint,
  bucket_1_30_cents    bigint,
  bucket_31_60_cents   bigint,
  bucket_61_90_cents   bigint,
  bucket_91_plus_cents bigint,
  total_open_cents     bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH bill AS (
    SELECT
      b.id,
      b.vendor_uuid,
      b.vendor_id,
      COALESCE(b.due_date, b.bill_date) AS eff_due,
      COALESCE(b.amount_cents, 0)::bigint AS amount_cents,
      COALESCE((
        SELECT SUM(COALESCE(bp.amount_cents, 0))
        FROM accounting.bill_payments bp
        WHERE bp.bill_id = b.id
          AND bp.payment_date <= p_as_of
          AND (bp.revoked_at IS NULL OR bp.revoked_at::date > p_as_of)
      ), 0)::bigint AS paid_as_of
    FROM accounting.bills b
    WHERE b.operating_company_id = p_opco
      AND b.bill_date <= p_as_of
      AND (b.revoked_at IS NULL OR b.revoked_at::date > p_as_of)
  ),
  open_bill AS (
    SELECT
      COALESCE(NULLIF(TRIM(bill.vendor_uuid), ''), bill.vendor_id, 'unknown') AS vendor_key,
      bill.vendor_uuid,
      bill.vendor_id,
      bill.eff_due,
      GREATEST(bill.amount_cents - bill.paid_as_of, 0)::bigint AS open_cents
    FROM bill
    WHERE GREATEST(bill.amount_cents - bill.paid_as_of, 0) > 0
  )
  SELECT
    ob.vendor_key::text AS vendor_id,
    COALESCE(v.vendor_name, ob.vendor_id, 'Unknown vendor')::text AS vendor_name,
    COUNT(*)::bigint AS open_bill_count,
    COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due >= p_as_of), 0)::bigint AS current_cents,
    COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < p_as_of AND ob.eff_due >= p_as_of - 30), 0)::bigint AS bucket_1_30_cents,
    COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < p_as_of - 30 AND ob.eff_due >= p_as_of - 60), 0)::bigint AS bucket_31_60_cents,
    COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < p_as_of - 60 AND ob.eff_due >= p_as_of - 90), 0)::bigint AS bucket_61_90_cents,
    COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < p_as_of - 90), 0)::bigint AS bucket_91_plus_cents,
    COALESCE(SUM(ob.open_cents), 0)::bigint AS total_open_cents
  FROM open_bill ob
  LEFT JOIN mdata.vendors v
    ON ob.vendor_uuid IS NOT NULL
   AND v.id::text = TRIM(ob.vendor_uuid)
  GROUP BY ob.vendor_key, COALESCE(v.vendor_name, ob.vendor_id, 'Unknown vendor');
$$;

GRANT EXECUTE ON FUNCTION accounting.ar_aging_as_of(uuid, date) TO ih35_app;
GRANT EXECUTE ON FUNCTION accounting.ap_aging_as_of(uuid, date) TO ih35_app;

COMMIT;
