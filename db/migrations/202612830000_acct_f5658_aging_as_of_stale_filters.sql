-- FINDING: ACCT-F5658 (Findings 2+3 of the aging audit) — the FIN-20 historical aging functions
-- (202606290040, applied and checksum-frozen — hence this NEW migration re-declaring them) drifted
-- behind three already-decided rules that every OTHER aging surface now enforces:
--
--   (AR) accounting.ar_aging_as_of used `status NOT IN ('draft','factored')` — counting BOTH classes
--        the TypeScript service (ar-aging.service.ts) and today's view (views.ar_aging, allow-list
--        'sent'/'partial') already exclude:
--          • 'proforma' (ACCT-F223): a projection with ZERO journal-entry rows — $22,720.00 across
--            8 proformas on USMCA alone, one of them $4,910 on a CANCELLED load.
--          • 'void' (ACCT-F171): the ONLY spelling invoices_status_check permits for a void; one
--            live row (status='void', voided_at NULL) put a voided $2,450.00 invoice — 56.6% of the
--            entity's reported receivables — into the report.
--        It also netted NO credit memos. The original migration's stated reason ("a dated
--        credit_memo_applications table that does not yet exist") is no longer true: migration
--        202612811300 (ACCT-F5606) created accounting.credit_memo_applications WITH applied_at,
--        and ACCT-F5612 established the netting rule every other A/R surface now applies.
--
--   (AP) accounting.ap_aging_as_of had NO bill-status filter at all — a half-typed DRAFT bill was
--        reported as money owed to a vendor — and netted no vendor credits, though
--        accounting.vendor_credit_applications (dated, ap-aging.service.ts already nets it) exists.
--
-- Consequence before this migration: the SAME A/R or A/P Aging screen changed its filtering rules
-- depending on whether the date picker said today (safe views) or any past date (these functions —
-- the exact path every Month-Close review link takes).
--
-- CANONICAL-CHECK: accounting.credit_memo_applications (canonical, ACCT-F5606, has applied_at +
-- voided_at) and accounting.vendor_credit_applications (canonical, has applied_at + voided_at) are
-- the dated application tables named below; both verified present in db/migrations
-- (202612811300_acct_f5606_credit_memo_applications.sql; vendor_credit_applications predates it).
-- No RETIRE table is read or written. accounting.* is the canonical accounting schema.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION only (same signatures, same RETURNS TABLE shapes — every
-- existing caller is unaffected structurally); GRANTs repeat harmlessly. FRESH-DB SAFE: both
-- functions and every referenced table exist earlier in the chain. READ-ONLY: no table/column
-- change, no RLS/GRANT change beyond re-stating the existing EXECUTE grants. NO new GL math — these
-- are report reconstructions; nothing posts.

BEGIN;

-- ============================================================
-- accounting.ar_aging_as_of(opco, as_of) — AR aging by customer, open balance AS OF as_of.
-- ACCT-F5658: adds the 'void'/'voided'/'proforma' exclusions (joining 'draft'; 'factored' exclusion
-- retained from the original) + dated credit-memo netting.
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
      ), 0)::bigint AS paid_as_of,
      -- ACCT-F5658 — dated credit-memo netting (ACCT-F5612's rule; the dated table this migration's
      -- predecessor said did not exist now does: accounting.credit_memo_applications, ACCT-F5606).
      COALESCE((
        SELECT SUM(cma.applied_cents)
        FROM accounting.credit_memo_applications cma
        WHERE cma.invoice_id = i.id
          AND cma.operating_company_id = p_opco
          AND cma.voided_at IS NULL
          AND (cma.applied_at AT TIME ZONE 'UTC')::date <= p_as_of
      ), 0)::bigint AS credited_as_of
    FROM accounting.invoices i
    WHERE i.operating_company_id = p_opco
      AND i.issue_date <= p_as_of
      -- ACCT-F5658 — 'void' (ACCT-F171: the only real void spelling; 'voided' unreachable but kept
      -- to match every sibling surface) and 'proforma' (ACCT-F223: posts no JE) added to the
      -- original 'draft'/'factored' exclusions.
      AND i.status NOT IN ('draft', 'factored', 'void', 'voided', 'proforma')
      AND (i.voided_at IS NULL OR i.voided_at::date > p_as_of)
  ),
  open_inv AS (
    SELECT
      inv.customer_id,
      inv.due_date,
      GREATEST(inv.total_cents - inv.paid_as_of - inv.credited_as_of, 0)::bigint AS open_cents
    FROM inv
    WHERE GREATEST(inv.total_cents - inv.paid_as_of - inv.credited_as_of, 0) > 0
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
-- ACCT-F5658: adds the missing status filter (draft/void bills are not payables) + dated
-- vendor-credit netting (mirrors ap-aging.service.ts's own AP_AGING_OPEN_BILLS_SQL exactly).
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
      ), 0)::bigint AS paid_as_of,
      -- ACCT-F5658 — dated vendor-credit netting, mirroring ap-aging.service.ts.
      COALESCE((
        SELECT SUM(vca.applied_cents)
        FROM accounting.vendor_credit_applications vca
        WHERE vca.bill_id = b.id
          AND vca.operating_company_id = p_opco
          AND vca.voided_at IS NULL
          AND (vca.applied_at AT TIME ZONE 'UTC')::date <= p_as_of
      ), 0)::bigint AS credited_as_of
    FROM accounting.bills b
    WHERE b.operating_company_id = p_opco
      AND b.bill_date <= p_as_of
      AND (b.revoked_at IS NULL OR b.revoked_at::date > p_as_of)
      -- ACCT-F5658 — the original had NO status filter: a half-typed DRAFT bill reported as money
      -- owed. 'void' is the real bills spelling; 'voided' unreachable but kept to match every
      -- sibling surface (ap-aging.service.ts, views.ap_aging's own allow-list).
      AND b.status NOT IN ('void', 'voided', 'draft')
  ),
  open_bill AS (
    SELECT
      COALESCE(NULLIF(TRIM(bill.vendor_uuid), ''), bill.vendor_id, 'unknown') AS vendor_key,
      bill.vendor_uuid,
      bill.vendor_id,
      bill.eff_due,
      GREATEST(bill.amount_cents - bill.paid_as_of - bill.credited_as_of, 0)::bigint AS open_cents
    FROM bill
    WHERE GREATEST(bill.amount_cents - bill.paid_as_of - bill.credited_as_of, 0) > 0
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
