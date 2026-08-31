-- LIVE REPURCHASE PRICE PER PURCHASED ACCOUNT (owner 2026-08-30).
-- Executed Faro agreement:
--   Repurchase Price = Net Amount + unpaid Transaction Fees + Default Interest - credits
-- The 2150 factoring-advance liability is ALREADY net of customer credits (the poster debits it on
-- every factoring_customer_payment), so "Net Amount - credits" is exactly the outstanding 2150
-- balance linked to the advance. Reusing that instead of re-deriving credits keeps this view and
-- poster.service.ts::linkedOutstandingLiabilityCents from ever drifting apart.
--
-- HONESTY NOTES (read before trusting a row):
--  * interest_unpaid_cents sums ACTIVE default-interest accruals. There is no per-accrual paid flag
--    today, so an accrual settled outside the accrual table would overstate this figure. Column
--    interest_basis_note carries that caveat on every row rather than hiding it.
--  * A row with purchase_date IS NULL cannot be aged; is_trackable = false says so out loud instead
--    of defaulting it to "fine".

BEGIN;

CREATE OR REPLACE VIEW views.factoring_repurchase_obligation AS
WITH liab_account AS (
  SELECT id, operating_company_id
    FROM catalogs.accounts
   WHERE system_purpose = 'factoring_advance_liability'
     AND deactivated_at IS NULL
),
outstanding AS (
  SELECT jep.source_transaction_id AS factoring_advance_id,
         SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents
                  ELSE -jep.amount_cents END)::bigint AS liability_cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    JOIN liab_account la ON la.id = jep.account_id
                        AND la.operating_company_id = jep.operating_company_id
   WHERE je.voided_at IS NULL
     AND jep.source_transaction_id IS NOT NULL
   GROUP BY jep.source_transaction_id
),
txn_fees AS (
  SELECT factoring_advance_id,
         SUM(amount_cents) FILTER (WHERE paid_or_deducted_on IS NULL)::bigint AS fees_unpaid_cents,
         SUM(amount_cents)::bigint AS fees_total_cents
    FROM accounting.factoring_transaction_fees
   WHERE voided_at IS NULL
   GROUP BY factoring_advance_id
),
interest AS (
  SELECT factoring_advance_id,
         SUM(interest_cents) FILTER (WHERE is_active)::bigint AS interest_unpaid_cents
    FROM accounting.factoring_default_interest_accruals
   GROUP BY factoring_advance_id
)
SELECT
  a.id                          AS factoring_advance_id,
  a.operating_company_id,
  a.display_id,
  a.status,
  a.purchase_date,
  a.invoice_total_cents         AS net_amount_cents,

  COALESCE(o.liability_cents, 0)      AS outstanding_liability_cents,  -- Net Amount - credits
  COALESCE(tf.fees_unpaid_cents, 0)   AS transaction_fees_unpaid_cents,
  COALESCE(i.interest_unpaid_cents,0) AS default_interest_unpaid_cents,

  ( COALESCE(o.liability_cents, 0)
  + COALESCE(tf.fees_unpaid_cents, 0)
  + COALESCE(i.interest_unpaid_cents, 0) )::bigint AS repurchase_price_cents,

  -- the contract's three clocks
  a.purchase_date + COALESCE(f.repurchase_term_days, 30)
                  + COALESCE(f.grace_period_days, 5)        AS default_interest_starts_on,
  a.repurchase_deadline_date,
  (a.repurchase_deadline_date - CURRENT_DATE)               AS days_to_repurchase_deadline,

  (a.purchase_date IS NOT NULL)                             AS is_trackable,
  ( a.purchase_date IS NOT NULL
    AND CURRENT_DATE > a.purchase_date + COALESCE(f.repurchase_term_days,30)
                                       + COALESCE(f.grace_period_days,5)
    AND COALESCE(o.liability_cents,0) > 0 )                 AS accruing_default_interest,
  ( a.purchase_date IS NOT NULL
    AND a.repurchase_deadline_date IS NOT NULL
    AND CURRENT_DATE > a.repurchase_deadline_date
    AND COALESCE(o.liability_cents,0) > 0 )                 AS past_repurchase_deadline,
  ( COALESCE(o.liability_cents,0) > 0
    AND COALESCE(o.liability_cents,0) < a.invoice_total_cents ) AS partially_paid_still_open,

  'ACTIVE default-interest accruals only; no per-accrual paid flag exists yet'::text
                                                            AS interest_basis_note
FROM accounting.factoring_advances a
LEFT JOIN outstanding o ON o.factoring_advance_id = a.id
LEFT JOIN txn_fees   tf ON tf.factoring_advance_id = a.id
LEFT JOIN interest    i ON i.factoring_advance_id = a.id
LEFT JOIN factoring.factor f
       ON f.operating_company_id = a.operating_company_id
      AND f.voided_at IS NULL AND f.active IS TRUE;

COMMENT ON VIEW views.factoring_repurchase_obligation IS
  'Executed Faro agreement: live Repurchase Price = Net Amount + unpaid Transaction Fees + '
  'Default Interest - credits, per Purchased Account, with the 30/5/95-day clocks. '
  'partially_paid_still_open is the owner''s short-pay case: the account REMAINS a Purchased '
  'Account (agreement, Repurchased Account Example 2) - a partial payment is a credit, not a '
  'settlement, and the balance keeps accruing.';

COMMIT;
