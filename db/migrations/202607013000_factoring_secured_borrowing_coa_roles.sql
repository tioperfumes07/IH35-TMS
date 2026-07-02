-- [HOLD-FOR-JORGE — TIER 1] CODER-34 — Factoring GL: SALE-model → SECURED-BORROWING (ASC 860).
--
-- *** DO NOT MERGE. DO NOT flip FACTORING_GL_POSTING_ENABLED. Posting flag DEFAULT OFF. ***
--
-- WHY: the live factoring poster booked FARO's advance as a customer_payment that CREDITED A/R and
-- recorded NO liability (sale/derecognition). The CPA ruling is SECURED BORROWING: the receivable STAYS
-- on the books until the customer pays FARO, the advance is a LIABILITY (a borrowing), the reserve is an
-- ASSET (due-from-factor), and the fee is a financing (interest) expense. This migration builds the COA +
-- role registry the re-architected poster resolves against. It adds NO posting code and NO GL math.
--
-- SCOPE (additive, per-entity TRANSP only — never USMCA/TRK):
--   §1 register FACTORING_GL_POSTING_ENABLED (lib.feature_flags, DEFAULT OFF — per-entity kill switch).
--   §2 widen the chart_of_accounts_roles.role CHECK (and the legacy account_role_bindings.role_key CHECK)
--      to add the 6 secured-borrowing roles as a TRUE SUPERSET of the existing values.
--   §3 CREATE (TRANSP only) the borrowing accounts: Interest & Financing Expense (parent), Factoring Fees,
--      Factoring Default Interest, Factoring Advance (Liability), A/R – Assigned to Faro, Factoring
--      Recoursed Invoices, Factoring Reserves (Asset).
--   §4 seed the role→account map (canonicalize the reserve role to factor_reserve_held).
--
-- RETIRE-NOT-DROP (documented, no live rows to change per GUARD's verified read): the v1.0 sale-model
-- concepts factor_advances_receivable (asset "FARO owes us") and factor_chargebacks_payable (liability)
-- are NOT used by the borrowing model. They exist only as legacy account_role_bindings.role_key values
-- (kept in the CHECK superset below so nothing 500s); no catalogs.accounts rows or chart_of_accounts_roles
-- rows are created for them and none are dropped. Under borrowing: the advance is a liability we owe FARO
-- (factoring_advance_liability), and a chargeback SETTLES that liability + returns the receivable to
-- factoring_recoursed_ar — no separate "chargebacks payable".
--
-- FRESH-DB SAFE (branch-copy-vs-fresh-DB landmine): every account/role seed is a CONDITIONAL
-- INSERT ... SELECT joined to org.companies WHERE code='TRANSP'. On a fresh CI DB with no TRANSP company
-- the joins yield 0 rows and the migration is a clean no-op; it NEVER RAISEs (a RAISE would fail
-- build-typecheck, which runs db:migrate on a virgin DB). Fail-closed behavior lives at runtime in the
-- resolver (CoaRoleResolutionError if a required role is unmapped) — not here.
--
-- Idempotent (IF NOT EXISTS / NOT EXISTS guards + ON CONFLICT). Per-entity unique on catalogs.accounts is
-- uq_accounts_company_account_number (operating_company_id, account_number) — the account_numbers below are
-- guarded by NOT EXISTS on (operating_company_id, account_number OR account_name) so a re-run or a pre-existing
-- account never errors. accounting.chart_of_accounts_roles + catalogs.accounts already GRANT to ih35_app
-- (0223 / 0010); no new table → no new GRANT. §1.4 financial cluster — NEVER self-merge; GUARD verifies the
-- $5,000 unwind on a Neon branch and Jorge applies JORGE-APPROVED.

BEGIN;

-- ===========================================================================================
-- §1 — Feature flag (per-entity kill switch), DEFAULT OFF. Read at runtime via
--      isEnabled(client, 'FACTORING_GL_POSTING_ENABLED', {operating_company_id}). NO global env read.
-- ===========================================================================================
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'FACTORING_GL_POSTING_ENABLED',
  'CODER-34: factoring funding/customer-payment/reserve-release/chargeback secured-borrowing GL posting. Per-entity override (TRANSP only). Default OFF (kill switch) until CPA sign-off + Neon verification.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

-- ===========================================================================================
-- §2 — Role registry: widen BOTH closed-list CHECK constraints as a TRUE SUPERSET.
--   accounting.chart_of_accounts_roles.role — current 16 (0223 base + 202606151500 uncategorized_expense
--   + FIN-22's rental_income/lease_receivable/interest_income/gain_loss_on_disposal) + 6 borrowing roles.
-- ===========================================================================================
ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role IN (
    -- existing 16 (preserve ALL)
    'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
    'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
    'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
    'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
    -- CODER-34 secured-borrowing roles
    'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
    'default_interest_expense','factor_reserve_held','factor_fee_expense'
  ));

-- catalogs.account_role_bindings.role_key — FIN-22 superset + the 6 borrowing roles (keep the legacy
-- factor_advances_receivable / factor_chargebacks_payable values so nothing 500s; they are retired-not-dropped).
ALTER TABLE catalogs.account_role_bindings DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
ALTER TABLE catalogs.account_role_bindings ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
  role_key = ANY (ARRAY[
    'ar_clearing', 'ap_clearing', 'cash_dip', 'cash_payroll', 'cash_petty',
    'fuel_expense', 'maintenance_expense', 'driver_payroll_clearing',
    'factor_advances_receivable', 'factor_chargebacks_payable', 'undeposited_funds',
    'driver_pay_expense', 'reimbursement_expense',
    'advance_recovery', 'damage_recovery', 'lease_recovery', 'insurance_recovery',
    'fuel_advance_recovery', 'other_recovery',
    'rental_income', 'lease_receivable', 'interest_income', 'gain_loss_on_disposal',
    -- CODER-34 secured-borrowing roles
    'factoring_advance_liability', 'ar_assigned_to_factor', 'factoring_recoursed_ar',
    'default_interest_expense', 'factor_reserve_held', 'factor_fee_expense'
  ])
);

-- ===========================================================================================
-- §3 — CREATE the borrowing accounts for TRANSP (per-entity). Parent FIRST (Interest & Financing
--      Expense), then its two sub-accounts (Factoring Fees, Factoring Default Interest), then the
--      balance-sheet accounts. Each guarded by NOT EXISTS on (operating_company_id, account_number OR
--      account_name); conditioned on org.companies.code='TRANSP' (no-op on a fresh DB without TRANSP).
-- ===========================================================================================

-- 3a. Interest & Financing Expense (parent) — #6810 Expense.
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '6810', 'Interest & Financing Expense', 'Expense', 'OtherExpense', false
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '6810' OR a.account_name = 'Interest & Financing Expense')
  );

-- 3b. Factoring Fees — #6820 Expense, sub-account of Interest & Financing Expense (borrowing = interest,
--     NEVER COGS / loss-on-sale). role factor_fee_expense resolves here.
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, parent_account_id, is_postable)
SELECT c.id, '6820', 'Factoring Fees', 'Expense', 'OtherExpense',
       (SELECT p.id FROM catalogs.accounts p
        WHERE p.operating_company_id = c.id AND p.account_name = 'Interest & Financing Expense' LIMIT 1),
       true
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '6820' OR a.account_name = 'Factoring Fees')
  );

-- 3c. Factoring Default Interest — #6830 Expense, sub of Interest & Financing (0.067%/day past the
--     30-day term + 5-day grace). role default_interest_expense resolves here.
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, parent_account_id, is_postable)
SELECT c.id, '6830', 'Factoring Default Interest', 'Expense', 'OtherExpense',
       (SELECT p.id FROM catalogs.accounts p
        WHERE p.operating_company_id = c.id AND p.account_name = 'Interest & Financing Expense' LIMIT 1),
       true
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '6830' OR a.account_name = 'Factoring Default Interest')
  );

-- 3d. Factoring Advance — #2150 Liability. THE missing core account (the borrowing). role
--     factoring_advance_liability. Credited at funding for the FULL net invoice; debited when the
--     customer pays FARO (A/R then clears) and at chargeback.
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '2150', 'Factoring Advance', 'Liability', 'OtherCurrentLiability', true
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '2150' OR a.account_name = 'Factoring Advance')
  );

-- 3e. A/R – Assigned to Faro — #1210 Asset (keeps pledged A/R separate from free trade A/R). role
--     ar_assigned_to_factor. Used by the optional reclass + the chargeback return leg.
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '1210', 'A/R - Assigned to Faro', 'Asset', 'AccountsReceivable', true
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '1210' OR a.account_name = 'A/R - Assigned to Faro')
  );

-- 3f. Factoring Recoursed Invoices — #1220 Asset. role factoring_recoursed_ar. The receivable that
--     returns to us when a customer does not pay by the deadline (collect directly / bad debt).
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '1220', 'Factoring Recoursed Invoices', 'Asset', 'AccountsReceivable', true
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '1220' OR a.account_name = 'Factoring Recoursed Invoices')
  );

-- 3g. Factoring Reserves — #1230 Asset (due-from-factor; the CPA ruling makes the reserve OUR asset,
--     NOT a liability). role factor_reserve_held (canonical; reconciles the code's old factor_reserve_default,
--     which the resolver's fallback mis-typed as a Liability). Debited at funding, released to Cash later.
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '1230', 'Factoring Reserves', 'Asset', 'OtherCurrentAsset', true
FROM org.companies c
WHERE c.code = 'TRANSP'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '1230' OR a.account_name = 'Factoring Reserves')
  );

-- ===========================================================================================
-- §4 — Seed the role→account map for TRANSP (accounting.chart_of_accounts_roles). Conditional,
--      idempotent (partial unique uq_coa_roles_company_role_active → ON CONFLICT DO UPDATE). Each binds
--      by account_name within the SAME operating company (never cross-entity).
-- ===========================================================================================
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
SELECT c.id, m.role, a.id, true, now(), now()
FROM org.companies c
JOIN (VALUES
  ('factoring_advance_liability', 'Factoring Advance'),
  ('ar_assigned_to_factor',       'A/R - Assigned to Faro'),
  ('factoring_recoursed_ar',      'Factoring Recoursed Invoices'),
  ('default_interest_expense',    'Factoring Default Interest'),
  ('factor_reserve_held',         'Factoring Reserves'),
  ('factor_fee_expense',          'Factoring Fees')
) AS m(role, account_name) ON true
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.account_name = m.account_name
 AND a.deactivated_at IS NULL
WHERE c.code = 'TRANSP'
ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
  SET account_id = EXCLUDED.account_id, updated_at = now();

COMMIT;

-- POST-DEPLOY VERIFICATION (run on prod / Neon branch after apply — expect 6 rows for TRANSP):
--   SET app.operating_company_id = '<TRANSP>';
--   SELECT r.role, a.account_number, a.account_name, a.account_type, p.account_name AS parent
--   FROM accounting.chart_of_accounts_roles r
--   JOIN catalogs.accounts a ON a.id = r.account_id
--   LEFT JOIN catalogs.accounts p ON p.id = a.parent_account_id
--   WHERE r.operating_company_id = (SELECT id FROM org.companies WHERE code='TRANSP')
--     AND r.role IN ('factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
--                    'default_interest_expense','factor_reserve_held','factor_fee_expense')
--   ORDER BY r.role;
--   -- factor_fee_expense + default_interest_expense parent MUST be 'Interest & Financing Expense'.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   BEGIN;
--     DELETE FROM accounting.chart_of_accounts_roles WHERE role IN
--       ('factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
--        'default_interest_expense','factor_reserve_held','factor_fee_expense');
--     -- delete the 7 accounts only if unreferenced by any posting; re-narrow both CHECKs to the prior lists;
--     DELETE FROM lib.feature_flags WHERE flag_key='FACTORING_GL_POSTING_ENABLED';
--   COMMIT;
