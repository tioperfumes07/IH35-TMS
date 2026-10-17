-- LEAD 443.178 (owner 2026-10-16 18:23 CT: "8 invoices still show unknown customer").
-- ROOT CAUSE: views.factoring_recourse_at_risk and views.factoring_chargebacks_fees read every
-- accounting.factoring_advances row, voided included. The 8 advances FAC-2026-00001..00008 (voided
-- 2026-10-16, CC-2 443.145 seed reversal) have their invoices unlinked on void, so the recourse view's
-- invoice/customer join finds nothing and prints 'Unknown Customer' on Aging and the Submit-invoice
-- debtor summary (8 rows, $32,850.00). The fees view counted their fees on Fees Paid.
-- FIX: a voided advance is not an open recourse exposure and not a fee — both views exclude it
-- (voided_at IS NULL AND status <> 'voided'). Columns and order are unchanged (CREATE OR REPLACE).
-- GUARD: scripts/verify-steps (factoring views exclude voided advances) + PGlite proof in the PR.

CREATE OR REPLACE VIEW views.factoring_recourse_at_risk AS
 WITH agreement_days AS (
         SELECT DISTINCT ON (a.operating_company_id) a.operating_company_id,
            a.repurchase_deadline_days
           FROM factoring.canonical_factor_agreements a
          WHERE a.voided_at IS NULL AND a.effective_from <= CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE) AND a.agreement_code = 'FARO_FULL_RECOURSE_V1'::text
          ORDER BY a.operating_company_id, a.effective_from DESC
        ), linked_invoice AS (
         SELECT fa_1.id AS factoring_advance_id,
            inv.display_id AS invoice_display_id,
            inv.customer_id
           FROM accounting.factoring_advances fa_1
             LEFT JOIN LATERAL ( SELECT i.display_id,
                    i.customer_id
                   FROM accounting.invoices i
                  WHERE i.factoring_advance_id = fa_1.id AND i.operating_company_id = fa_1.operating_company_id AND i.voided_at IS NULL
                  ORDER BY i.created_at DESC
                 LIMIT 1) inv ON true
        )
 SELECT fa.id AS factoring_advance_id,
    fa.operating_company_id,
    NULL::text AS active_factor_name,
    COALESCE(li.invoice_display_id, fa.display_id, fa.id::text) AS invoice_reference,
    COALESCE(c.customer_name, 'Unknown Customer'::text) AS customer_name,
    fa.invoice_total_cents::numeric / 100::numeric AS invoice_amount,
    fa.advance_amount_cents::numeric / 100::numeric AS advance_amount,
    fa.reserve_amount_cents::numeric / 100::numeric AS reserve_amount,
    COALESCE(fa.advanced_at, fa.created_at) AS factored_at,
    (COALESCE(fa.advanced_at, fa.created_at) + ((COALESCE(ag.repurchase_deadline_days, 95) || ' days'::text)::interval))::date AS recourse_expiry_date,
    GREATEST(0, COALESCE(ag.repurchase_deadline_days, 95) - (CURRENT_DATE - COALESCE(fa.advanced_at, fa.created_at)::date)) AS days_until_recourse_expiry
   FROM accounting.factoring_advances fa
     LEFT JOIN agreement_days ag ON ag.operating_company_id = fa.operating_company_id
     LEFT JOIN linked_invoice li ON li.factoring_advance_id = fa.id
     LEFT JOIN mdata.customers c ON c.id = li.customer_id AND c.operating_company_id = fa.operating_company_id
  WHERE COALESCE(fa.advanced_at, fa.created_at) >= (now() - '120 days'::interval)
    AND fa.voided_at IS NULL
    AND fa.status IS DISTINCT FROM 'voided'::text
  ORDER BY (GREATEST(0, COALESCE(ag.repurchase_deadline_days, 95) - (CURRENT_DATE - COALESCE(fa.advanced_at, fa.created_at)::date))), (COALESCE(fa.advanced_at, fa.created_at)) DESC;

CREATE OR REPLACE VIEW views.factoring_chargebacks_fees AS
 SELECT id AS factoring_advance_id,
    operating_company_id,
    created_at,
    date_trunc('month'::text, created_at)::date AS statement_month,
    0::numeric AS chargeback_amount,
    factor_fee_cents::numeric / 100::numeric AS factor_fee_amount,
    COALESCE(NULLIF(memo, ''::text), display_id, id::text) AS statement_reference,
    advance_amount_cents::numeric / 100::numeric AS advance_amount
   FROM accounting.factoring_advances fa
  WHERE fa.voided_at IS NULL
    AND fa.status IS DISTINCT FROM 'voided'::text
  ORDER BY created_at DESC;

-- LEAD 443.179 (owner 2026-10-16 18:4x CT, after being told what the Faro Factoring screen should show — every purchase
-- Faro made, every collection that paid one down, the balance owed to Faro: "ok if it supposed to show that why isnt it
-- showing it … wire completely and fix and find root problems and permanent solutions").
-- ROOT CAUSE: the Banking account "Faro Factoring - USMCA" (f2b7915d-…) was mapped to ledger 1296, an account no
-- factoring writer posts to (0 postings ever). The purchase engine posts the advance to 2150 Factoring Advance and Faro
-- collections relieve 2150, so the screen could never show a purchase.
-- FIX: map that Banking account to USMCA 2150 Factoring Advance. Guarded: only the one row, only while it still points
-- at 1296, only if no active bank account already owns 2150 (bank_accounts_active_ledger_account_uidx). The row-audit
-- trigger records the change; banking.assert_cash_gl_account_postable() validates 2150. 1296 itself is not touched.
UPDATE banking.bank_accounts ba
   SET ledger_account_id = a2150.id,
       updated_at = now()
  FROM catalogs.accounts a2150, catalogs.accounts a1296
 WHERE ba.id = 'f2b7915d-823c-4e40-8019-4d94b0404b42'::uuid
   AND ba.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
   AND a1296.id = ba.ledger_account_id
   AND a1296.account_number = '1296'
   AND a2150.operating_company_id = ba.operating_company_id
   AND a2150.account_number = '2150'
   AND a2150.deactivated_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM banking.bank_accounts other
      WHERE other.operating_company_id = ba.operating_company_id
        AND other.ledger_account_id = a2150.id
        AND other.is_active = true AND other.deactivated_at IS NULL
   );
