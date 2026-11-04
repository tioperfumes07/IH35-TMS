-- FINDING: ACCT-F11103 — the dated A/R aging dropped payment-less relief applications.
--
-- ROOT CAUSE: ACCT-F11070 (#28623) records poster relief (Faro collected the cash — no TMS customer-payment document) as an
-- accounting.payment_applications row with payment_id NULL (nullable since 202616360200). accounting.recompute_invoice_paid()
-- counts it (amount_paid_cents moves), but accounting.ar_aging_as_of() summed applications through an INNER JOIN to
-- accounting.payments, so the relief vanished from the dated aging: a $50,000.00 invoice with a $20,000.00 relief application
-- aged at $50,000.00, not $30,000.00. The TS readers (ar-aging, fin20-aging, customer statements / activity, consolidated
-- eliminations, factoring pledge base, cash-basis P&L settlements) carried the same INNER JOIN.
--
-- FIX: ONE applied-amount rule, accounting.invoice_applied_cents_as_of(invoice, as_of):
--   LEFT JOIN payments; date = payments.payment_date, or the application's applied_at (UTC date) when payment_id is NULL;
--   excluded when unapplied on/before the date or when its payment was voided on/before the date.
--   - accounting.ar_aging_as_of() reads it (rest of the body byte-identical to 202616380100).
--   - accounting.recompute_invoice_paid() reads it with 'infinity' (rest byte-identical to 202616380100), so the header
--     amount_paid_cents and the dated aging cannot disagree. The added voided-payment rule changes nothing in practice: the
--     one payment void writer (payment-void-stamp.service.ts) stamps unapplied_at on every application of the payment.
--   - views.ar_aging is NOT changed: it reads amount_open_cents (generated from amount_paid_cents), which the trigger already
--     derives from every live application, payment-less included.
--
-- PROD DATA (measured 2026-11-04): USMCA 0 accounting.payment_applications, 0 with payment_id NULL, 0 invoices with
-- amount_paid_cents <> 0 — nothing to repair.
--
-- IDEMPOTENT: CREATE OR REPLACE only. NO RLS / grant change beyond EXECUTE on the new function to ih35_app.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.invoice_applied_cents_as_of(p_invoice_id uuid, p_as_of date)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(pa.amount_cents), 0)::bigint
    FROM accounting.invoices i
    JOIN accounting.payment_applications pa
      ON pa.invoice_id = i.id
     AND pa.operating_company_id = i.operating_company_id
    LEFT JOIN accounting.payments p
      ON p.id = pa.payment_id
     AND p.operating_company_id = pa.operating_company_id
   WHERE i.id = p_invoice_id
     -- dated by the payment's date when the application has a payment, by the application's own date when it has none
     AND COALESCE(p.payment_date, (pa.applied_at AT TIME ZONE 'UTC')::date) <= p_as_of
     -- a payment voided on/before the date applies nothing (a payment-less application has no payment to void)
     AND (p.voided_at IS NULL OR (p.voided_at AT TIME ZONE 'UTC')::date > p_as_of)
     -- an application unapplied on/before the date applies nothing
     AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > p_as_of);
$$;

COMMENT ON FUNCTION accounting.invoice_applied_cents_as_of(uuid, date) IS
  'ACCT-F11103: cents applied to the invoice as of the date — payment-backed applications (dated by payments.payment_date) AND payment-less relief applications (payment_id NULL, ACCT-F11070; dated by applied_at). Excludes unapplied applications and voided payments as of the date. p_as_of = infinity gives the live total accounting.recompute_invoice_paid() writes to amount_paid_cents.';

GRANT EXECUTE ON FUNCTION accounting.invoice_applied_cents_as_of(uuid, date) TO ih35_app;

CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice_id uuid;
  v_new_invoice_id uuid := NULL;
  v_old_invoice_id uuid := NULL;
  v_paid bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_invoice_id := NEW.invoice_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_invoice_id := OLD.invoice_id;
  END IF;

  FOR v_invoice_id IN
    SELECT DISTINCT x.invoice_id
    FROM (VALUES (v_new_invoice_id), (v_old_invoice_id)) AS x(invoice_id)
    WHERE x.invoice_id IS NOT NULL
  LOOP
    -- ACCT-F11103: the ONE applied-amount rule every A/R reader uses (payment-backed AND payment-less relief applications;
    -- live = not unapplied, payment not voided). 'infinity' = every live application, whatever its date — the header is the
    -- running total, and ar_aging_as_of(opco, <date on/after the last application>) equals total - this - credits.
    v_paid := accounting.invoice_applied_cents_as_of(v_invoice_id, 'infinity'::date);

    UPDATE accounting.invoices i
    SET
      amount_paid_cents = v_paid,
      status = CASE
        WHEN i.status = 'void' THEN 'void'
        -- ACCT-F11099 (owner 2026-11-04): a factored invoice moves to paid / partial like any invoice; its factoring
        -- identity lives in factoring_status / factoring_advance_id (accounting.invoice_recoursed_off_trade_ar).
        WHEN v_paid >= i.total_cents AND i.total_cents > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        WHEN i.status IN ('partial', 'paid') THEN
          CASE WHEN accounting.invoice_recoursed_off_trade_ar(i.id) THEN 'factored' ELSE 'sent' END
        ELSE i.status
      END,
      updated_at = now()
    WHERE i.id = v_invoice_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- accounting.ar_aging_as_of — body identical to 202616380100 except paid_as_of reads accounting.invoice_applied_cents_as_of.
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
      -- ACCT-F11103: was an INNER JOIN to accounting.payments, which dropped payment-less relief applications (ACCT-F11070).
      accounting.invoice_applied_cents_as_of(i.id, p_as_of) AS paid_as_of,
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
      -- ACCT-F11099 — a recoursed invoice stays off trade A/R after a payment moves its status to partial / paid.
      AND NOT accounting.invoice_recoursed_off_trade_ar(i.id)
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

GRANT EXECUTE ON FUNCTION accounting.ar_aging_as_of(uuid, date) TO ih35_app;

COMMIT;
