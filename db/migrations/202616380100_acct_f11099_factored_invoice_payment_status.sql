-- FINDING: ACCT-F11099 — a customer payment on a factored invoice never moved it to partial / paid.
--
-- OWNER DECISION (Jorge, 2026-11-04 08:30 CT): a customer payment moves a factored invoice to partial / paid like QuickBooks.
-- The factoring itself stays tracked in its own fields (accounting.invoices.factoring_status, factoring_advance_id and the
-- factoring tables) — never in the payment status.
--
-- ROOT CAUSE: accounting.recompute_invoice_paid() (last defined by 202612821200, ACCT-F5622; prod pg_get_functiondef
-- measured 2026-11-04 identical) carries `WHEN i.status = 'factored' THEN 'factored'` ahead of the paid / partial branches.
-- Since ACCT-F11070 (#28623) that trigger is the ONE writer of amount_paid_cents + status (poster relief is a payment-less
-- application), so a factored invoice kept status 'factored' at $40k of $100k paid, and at $100k of $100k paid. CI:
-- chain-06-factoring-ar-tieout.db.test.ts F1 (expects 'partial' at $40k and $70k).
--
-- WHAT 'factored' MEANT TO ITS READERS: status 'factored' is stamped by exactly one engine writer — the factoring chargeback
-- poster (factoring-posting/poster.service.ts applyChargebackSubledgerRelief) in the same transaction as its A/R-relief JE
-- (Dr factoring_recoursed_ar / Cr ar_control) — plus the manual invoices-bulk status route. Every A/R reader that excludes
-- 'factored' (AR aging, ar_aging_as_of, views.ar_aging allow-list, customer statements/activity, fin20 aging, cash forecast,
-- customer report, consolidated eliminations) excludes it because that receivable has moved OFF trade A/R. A funded invoice
-- is NOT that: prod USMCA 2026-11-04 = 57 invoices status 'sent' + factoring_status 'advanced' ($175,650.00) that stay on
-- trade A/R as pledged collateral (secured borrowing). So the readers' identity cannot be "factoring_status <> not_factored"
-- (that would drop $175,650.00 from USMCA A/R aging today); it is "recoursed off trade A/R".
--
-- FIX:
--   1. accounting.invoice_recoursed_off_trade_ar(invoice_id) — the factoring identity the readers need, from the factoring
--      fields, not the payment status: status 'factored' (the chargeback / manual stamp, until a payment moves it) OR
--      factoring_status 'recourse_returned' on an advance that carries a live (not voided, not reversed) chargeback posting
--      (journal_entry_postings.source_transaction_type 'factoring_chargeback', source_transaction_id = the advance — the link
--      attachFactoringLifecycleSourceLinksStrict writes). A route-only recourse return with no chargeback JE is NOT off
--      trade A/R (the GL never moved it) and stays false.
--   2. accounting.recompute_invoice_paid(): the 'factored' pin is removed. paid >= total -> 'paid'; 0 < paid -> 'partial';
--      paid back to 0 on a partial/paid invoice -> 'factored' when it is recoursed off trade A/R, else 'sent' (the state it
--      held before the payment). 'void' kept. Every other line is byte-identical to the live prod definition.
--   3. accounting.ar_aging_as_of() and views.ar_aging repointed to the identity (status allow/deny lists kept as they are).
--      TS readers repoint in the same PR (apps/backend/src/accounting/invoice-factored-identity.ts).
--
-- PROD DATA: USMCA 2026-11-04 — 0 invoices status 'factored', 0 accounting.payment_applications, 0 factoring_chargeback
-- postings: nothing to repair; the next payment application recomputes through the new function.
--
-- IDEMPOTENT: CREATE OR REPLACE only. The view keeps its column list, security_invoker = true and its grant. NO RLS change.

BEGIN;

CREATE OR REPLACE FUNCTION accounting.invoice_recoursed_off_trade_ar(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT i.status = 'factored'
        OR (
          COALESCE(i.factoring_status, 'not_factored') = 'recourse_returned'
          AND i.factoring_advance_id IS NOT NULL
          AND EXISTS (
            SELECT 1
              FROM accounting.journal_entry_postings jep
              JOIN accounting.journal_entries je
                ON je.id = jep.journal_entry_uuid
               AND je.operating_company_id = jep.operating_company_id
             WHERE jep.operating_company_id = i.operating_company_id
               AND jep.source_transaction_type = 'factoring_chargeback'
               AND jep.source_transaction_id = i.factoring_advance_id::text
               AND je.voided_at IS NULL
               AND je.reversed_by_je_id IS NULL
          )
        )
      FROM accounting.invoices i
     WHERE i.id = p_invoice_id
  ), false);
$$;

COMMENT ON FUNCTION accounting.invoice_recoursed_off_trade_ar(uuid) IS
  'ACCT-F11099: true when the invoice''s receivable has moved off trade A/R through factoring recourse (status factored, or factoring_status recourse_returned with a live factoring_chargeback posting on its advance). Payment status (partial/paid) never decides it.';

GRANT EXECUTE ON FUNCTION accounting.invoice_recoursed_off_trade_ar(uuid) TO ih35_app;

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
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_paid
    FROM accounting.payment_applications
    WHERE invoice_id = v_invoice_id
      -- ACCT-F5622: exclude voided (unapplied) applications so a payment void reverts the invoice's
      -- paid status instead of silently recomputing the same total.
      AND unapplied_at IS NULL;

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

-- accounting.ar_aging_as_of — body identical to 202612830000 (prod md5 measured equal to that file's definition) except the
-- recoursed-off-trade-A/R predicate beside the status exclusion.
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

-- views.ar_aging — body = prod pg_get_viewdef (measured 2026-11-04, reloptions security_invoker=true) + the identity.
CREATE OR REPLACE VIEW views.ar_aging
WITH (security_invoker = true)
AS
 SELECT i.operating_company_id,
    i.customer_id,
    c.customer_name,
    count(*) FILTER (WHERE i.amount_open_cents > 0) AS open_invoice_count,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date >= CURRENT_DATE), 0::numeric) AS current_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE AND i.due_date >= (CURRENT_DATE - 30)), 0::numeric) AS bucket_1_30_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < (CURRENT_DATE - 30) AND i.due_date >= (CURRENT_DATE - 60)), 0::numeric) AS bucket_31_60_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < (CURRENT_DATE - 60) AND i.due_date >= (CURRENT_DATE - 90)), 0::numeric) AS bucket_61_90_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < (CURRENT_DATE - 90)), 0::numeric) AS bucket_91_plus_cents,
    COALESCE(sum(i.amount_open_cents), 0::numeric) AS total_open_cents
   FROM accounting.invoices i
     JOIN mdata.customers c ON c.id = i.customer_id
  WHERE (i.status = ANY (ARRAY['sent'::text, 'partial'::text])) AND i.voided_at IS NULL
    AND NOT accounting.invoice_recoursed_off_trade_ar(i.id)
  GROUP BY i.operating_company_id, i.customer_id, c.customer_name;

GRANT SELECT ON views.ar_aging TO ih35_app;

COMMIT;
