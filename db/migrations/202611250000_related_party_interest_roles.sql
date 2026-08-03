-- [FINANCIAL-CLUSTER] LOAN-06 — dedicated interest wiring for related-party loans.
-- POSTS NOTHING. Additive: one account, one CHECK widening (verbatim superset), two role bindings.
-- Idempotent (INSERT ... WHERE NOT EXISTS, DROP CONSTRAINT IF EXISTS + ADD). Apply-twice safe.
--
-- CANONICAL-CHECK: n/a — creates no table. Adds a row to catalogs.accounts (the single canonical chart)
-- and rows to accounting.chart_of_accounts_roles (the single canonical role map). No new ledger.
--
-- ROOT CAUSE — A MISPOSTING TRAP FOUND BY READING THE LIVE ROLE MAP BEFORE BUILDING ON IT.
-- The obvious way to post related-party loan interest is to resolve the existing roles. On prod
-- 2026-08-03 those roles resolve to:
--     TRANSP  default_interest_expense -> 6830 Factoring Default Interest
--     USMCA   default_interest_expense -> 6830 Factoring Default Interest
--     TRK     interest_income          -> 42500-LEASE Interest Income — Leases
--     TRANSP/USMCA interest_income     -> (UNBOUND)
-- `default_interest_expense` is FACTORING-SPECIFIC on both operating entities. Had the loan poster
-- reused it, an owner's loan interest would post into Factoring Default Interest — overstating factoring
-- cost and hiding related-party interest, in a Chapter 11 estate where factoring is precisely what a
-- reviewer examines. `interest_income` existed only on TRK and pointed at LEASE income, which is a
-- different economic event again.
--
-- WHY A NEW ROLE RATHER THAN REUSING default_interest_expense: they are different facts. Factoring
-- default interest is a financing penalty on receivables sold; related-party interest is the cost of
-- money borrowed from an insider, and ASC 850 requires it to be separately disclosable. Collapsing them
-- would make the disclosure impossible to produce from the ledger — the report would have to guess.
--
-- WHY 6810 FOR BOTH: TRANSP already had 6810 "Interest & Financing Expense" (general, non-factoring).
-- USMCA had NO general interest expense account at all — only 6830 Factoring Default Interest — so the
-- same account is created there, keeping the two charts aligned instead of inventing a second number.
--
-- interest_income binds to 7100 Interest Income on both operating entities (created in LOAN-03). TRK is
-- untouched: its interest_income already points at lease income, which is correct for TRK and would be
-- wrong to overwrite.
--
-- RLS SAFETY — WHY EVERY DO BLOCK SETS THE BYPASS FIRST. Both tables this migration reads are
-- FORCE RLS: accounting.chart_of_accounts_roles (policy coa_roles_company_scope) and catalogs.accounts
-- (accounts_entity_select/write). A migration that runs under an RLS-SUBJECT role therefore sees ZERO
-- rows, its `NOT EXISTS` guards all pass, and its fail-closed assertions then RAISE — aborting the
-- deploy over data that is actually present. That is not hypothetical: re-running these statements as
-- ih35_app produced exactly that, "2 entit(ies) cannot resolve both roles", against a database where all
-- four bindings existed. Both policies carry a real bypass branch (`app.bypass_rls = 'lucia'` /
-- identity.is_lucia_bypass()), so SET LOCAL makes the reads honest for the length of the transaction and
-- nothing else.

BEGIN;

SET LOCAL app.bypass_rls = 'lucia';

DO $$
BEGIN
  -- ── USMCA general interest expense account (TRANSP already has 6810) ────────────────────────────
  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT c.id, '6810', 'Interest & Financing Expense', 'Expense', 'OtherExpense', true
  FROM org.companies c
  WHERE c.code = 'USMCA'
    AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='6810');
END $$;

-- ── admit the new role. VERBATIM SUPERSET: the 50 existing members were read from pg_constraint on
-- prod in this session and are reproduced exactly; only 'related_party_interest_expense' is added.
-- Re-stating a CHECK is how members get silently dropped, so the list is copied, never recalled.
ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role = ANY (ARRAY[
    'ar_control'::text,'ap_control'::text,'cash_clearing'::text,'undeposited_funds'::text,
    'revenue_default'::text,'expense_default'::text,'factor_reserve_default'::text,
    'escrow_liability_default'::text,'sales_tax_payable'::text,'cash_basis_adjustment_equity'::text,
    'retained_earnings'::text,'uncategorized_expense'::text,'rental_income'::text,
    'lease_receivable'::text,'interest_income'::text,'gain_loss_on_disposal'::text,
    'factoring_advance_liability'::text,'ar_assigned_to_factor'::text,'factoring_recoursed_ar'::text,
    'default_interest_expense'::text,'factor_reserve_held'::text,'factor_fee_expense'::text,
    'property_tax_expense'::text,'property_tax_payable'::text,'driver_pay_expense'::text,
    'driver_payroll_clearing'::text,'reimbursement_expense'::text,'advance_recovery'::text,
    'damage_recovery'::text,'lease_recovery'::text,'insurance_recovery'::text,
    'fuel_advance_recovery'::text,'other_recovery'::text,'abandonment_chargeback_recovery'::text,
    'cash_dip'::text,'civil_fines_expense'::text,'maintenance_parts_expense'::text,
    'warranty_recovery'::text,'fuel_overage_receivable'::text,'factor_wire_fee'::text,
    'insurance_expense'::text,'unbilled_revenue'::text,'fixed_asset_default'::text,
    'accum_depr_default'::text,'depr_expense_default'::text,'heavy_repair_expense'::text,
    'prepaid_asset_default'::text,'amortization_expense_default'::text,
    'broker_customer_advance_liability'::text,'rent_expense'::text,
    -- LOAN-06: related-party loan interest. Deliberately NOT default_interest_expense, which is
    -- factoring-specific on both operating entities.
    'related_party_interest_expense'::text
  ]));

DO $$
DECLARE v_missing int;
BEGIN
  -- ── bind the two roles for the OPERATING entities only ─────────────────────────────────────────
  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT c.id, 'interest_income', a.id, true
  FROM org.companies c
  JOIN catalogs.accounts a ON a.operating_company_id=c.id AND a.account_number='7100'
  WHERE c.code IN ('TRANSP','USMCA')
    AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                     WHERE r.operating_company_id=c.id AND r.role='interest_income' AND r.is_active);

  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT c.id, 'related_party_interest_expense', a.id, true
  FROM org.companies c
  JOIN catalogs.accounts a ON a.operating_company_id=c.id AND a.account_number='6810'
  WHERE c.code IN ('TRANSP','USMCA')
    AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                     WHERE r.operating_company_id=c.id AND r.role='related_party_interest_expense' AND r.is_active);

  -- Fail closed: both operating entities must be able to post BOTH sides of loan interest.
  SELECT count(*) INTO v_missing
  FROM org.companies c
  WHERE c.code IN ('TRANSP','USMCA')
    AND (NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                      WHERE r.operating_company_id=c.id AND r.role='interest_income' AND r.is_active)
      OR NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                      WHERE r.operating_company_id=c.id AND r.role='related_party_interest_expense' AND r.is_active));
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'LOAN-06: % operating entit(y/ies) cannot resolve both interest roles', v_missing;
  END IF;

  -- Fail closed: the related-party role must NEVER land on the factoring account. This is the whole
  -- point of the migration; if a future edit repoints it, this refuses.
  IF EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
    JOIN catalogs.accounts a ON a.id=r.account_id
    WHERE r.role='related_party_interest_expense' AND r.is_active AND a.account_number='6830'
  ) THEN
    RAISE EXCEPTION 'LOAN-06: related_party_interest_expense is bound to 6830 Factoring Default Interest — that is the misposting this migration exists to prevent';
  END IF;
END $$;

COMMIT;
