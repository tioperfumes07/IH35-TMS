-- FINDING: ACCT-F5616 — an approved/partial settlement dispute posts a corrective journal entry
-- through createCorrectiveJournalEntry() (settlement-dispute.service.ts), but the Dr/Cr accounts for
-- that entry are chosen by pickCorrectionAccounts(): `SELECT id FROM catalogs.accounts ... ORDER BY
-- created_at ASC NULLS LAST, id ASC LIMIT 2` — the first TWO rows in the entity's chart of accounts,
-- whatever they happen to be. No role, no purpose, no fail-closed guard. Every OTHER poster in this
-- codebase (settlement-payrun-close.service.ts, settlement-posting.service.ts, posting-engine.service.ts)
-- resolves a specific designated CoA role and refuses to post when it's undesignated; this is the one
-- path that instead posts to whichever accounts sort first.
--
-- Confirmed live (tiny-field-89581227, bypass-RLS read): zero driver_settlement_disputes rows have
-- ever carried a resolution_journal_entry_id, so this has never actually mis-posted a real dispute
-- correction — but it is genuinely broken and reachable the moment an Owner/Admin approves or
-- partially-approves a dispute with SETTLEMENT_GL_POSTING_ENABLED on for that entity.
--
-- WHAT THIS MIGRATION DOES: widens accounting.chart_of_accounts_roles.role's CHECK constraint to admit
-- a new role, `settlement_dispute_correction_recovery`, so the code half (a companion PR repointing
-- createCorrectiveJournalEntry at the standard fail-closed CoA-role resolver instead of
-- pickCorrectionAccounts) can designate and resolve it. NO SEED, NO GL MATH, NO ACCOUNT BINDING here —
-- matching 202607670000's own "the exact account is an OWNER decision" principle: this role
-- represents a real accounting-treatment choice (which GL account absorbs a dispute correction credit)
-- that must not be guessed. Undesignated == the poster fails closed (post NOTHING), exactly the
-- existing behavior every other CoA-role-gated poster already has.
--
-- The list below is reproduced from the LIVE constraint definition on prod (queried directly,
-- 2026-08-20), not retyped from the TypeScript COA_ROLE_VALUES union, because the two are already
-- known to differ (prod also admits 'broker_customer_advance_liability', not in the TS union at the
-- time 202612481130 shipped). Retyping from code would silently drop whatever prod-only value exists
-- today and break any row using it (Rule 07 never-delete-only-add). Every existing value is preserved
-- and exactly one is added.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, guarded by to_regclass so a fresh CI DB
-- before this table exists is a clean no-op (matches 202612481130's own guard shape).
-- FRESH-DB SAFE: pure DDL on a table that already exists by this point in the chain (0223). No RAISE,
-- no data dependency, no rows required to satisfy the new CHECK.
-- NO RLS/GRANT CHANGE: accounting.chart_of_accounts_roles already carries FORCED RLS + standard grants.

DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN
    ALTER TABLE accounting.chart_of_accounts_roles
      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
    ALTER TABLE accounting.chart_of_accounts_roles
      ADD CONSTRAINT chart_of_accounts_roles_role_check
      CHECK (role IN (
        'ar_control','ap_control','cash_clearing','undeposited_funds',
        'revenue_default','expense_default','factor_reserve_default','escrow_liability_default',
        'sales_tax_payable','cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
        'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
        'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar','default_interest_expense',
        'factor_reserve_held','factor_fee_expense','property_tax_expense','property_tax_payable',
        'driver_pay_expense','driver_payroll_clearing','reimbursement_expense','advance_recovery',
        'damage_recovery','lease_recovery','insurance_recovery','fuel_advance_recovery',
        'other_recovery','abandonment_chargeback_recovery','cash_dip','civil_fines_expense',
        'maintenance_parts_expense','warranty_recovery','fuel_overage_receivable','factor_wire_fee',
        'insurance_expense','unbilled_revenue','fixed_asset_default','accum_depr_default',
        'depr_expense_default','heavy_repair_expense','prepaid_asset_default','amortization_expense_default',
        'broker_customer_advance_liability','rent_expense','related_party_interest_expense','operating_bank',
        -- NEW — ACCT-F5616
        'settlement_dispute_correction_recovery'
      ));
  END IF;
END $$;
