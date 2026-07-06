-- [HOLD-FOR-JORGE — TIER 1] Business-Property Allocation — property-tax ACCRUAL + PAYMENT GL posting.
-- FINANCIAL / §1.4 cluster. Companion to the filing migration 202607080300_property_tax_rendition_filing.sql
-- (which must apply FIRST — this table cross-references compliance.property_tax_renditions).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. DO NOT flip PROPERTY_TAX_GL_POSTING_ENABLED. Posting flag DEFAULT
--     OFF. Run ONLY on a Neon branch by Jorge's hand after CPA sign-off, then ledger-backfill so prod
--     db:migrate skips it. ***
--
-- WHAT: the GL scaffolding the (inert, flag-gated) property-tax poster resolves against. It adds NO posting
-- code and NO GL math — the poster reuses accounting.createJournalEntry (the DB double-entry trigger tables)
-- and the entity-pinned role resolver, exactly like the factoring/settlement posters.
--   §1 register PROPERTY_TAX_GL_POSTING_ENABLED (lib.feature_flags, DEFAULT OFF — per-entity kill switch).
--   §2 widen accounting.chart_of_accounts_roles.role (and legacy catalogs.account_role_bindings.role_key)
--      CHECKs as a TRUE SUPERSET to add property_tax_expense + property_tax_payable.
--   §3 CREATE (TRANSP + TRK) the two accounts: Property Taxes (Expense) + Property Tax Payable (Liability).
--   §4 seed the role→account map for TRANSP + TRK.
--   §5 accounting.property_tax_accruals — the accrual/payment ledger linking rendition → JEs → audit.
--
-- ACCOUNTING (CPA to confirm; design doc docs/accounting/PROPERTY-TAX-POSTER-DESIGN.md):
--   ACCRUAL  Dr Property Taxes (expense)     / Cr Property Tax Payable (liability)   [amount = CAD assessment]
--   PAYMENT  Dr Property Tax Payable (liab.) / Cr Cash (cash_clearing)               [when paid to the county]
-- Cash-basis carriers may skip the accrual and post only the payment; the poster supports both (accrual is
-- optional per entity policy). No new cash account — reuses the existing cash_clearing role.
--
-- ENTITIES: TRANSP (operating carrier — its own office property) + TRK (asset holder — owns the fleet it
-- renders). USMCA is pre-launch (no COA) — deliberately untouched. Property tax is filed by the OWNER of
-- the business personal property, so the fleet renditions are TRK's; TRANSP renders what it owns.
--
-- FRESH-DB SAFE: every account/role seed is a CONDITIONAL INSERT ... SELECT joined to org.companies WHERE
-- code IN ('TRANSP','TRK'); on a fresh CI DB with no such company the joins yield 0 rows and the migration
-- is a clean no-op — it NEVER RAISEs. Idempotent (IF NOT EXISTS / NOT EXISTS guards + ON CONFLICT).
-- void-not-delete (is_active). Self-contained grants. §1.4 — NEVER self-merge; CPA + Neon verify; Jorge
-- applies JORGE-APPROVED and flips the flag per entity.
--
-- CONCURRENCY NOTE: §2 rebuilds the two closed-list CHECKs as a SUPERSET of main's CURRENT values
-- (CODER-34 / 202607013000 = the last widener on main: 22 roles = 12 base + FIN-22's 4 + CODER-34's 6).
-- §2's list = those 22 + property_tax_expense + property_tax_payable = 24 (a TRUE SUPERSET). If a
-- concurrently-held migration widens the same CHECK first, reconcile the value list at apply time
-- (Jorge applies held migrations in order on the Neon branch).
--
-- CROSS-PR RECONCILE (vs #2151 settlement-contract-terms 202607080000, held concurrently): #2151 does
-- NOT touch either CoA role-CHECK and seeds ZERO chart_of_accounts_roles rows — it adds no role values.
-- Therefore this migration's DROP+ADD superset composes with #2151 in EITHER apply order with no
-- collision: applying #2151 first adds no roles this ADD CONSTRAINT would reject; applying this first
-- leaves a 24-role CHECK that #2151 never narrows. (Verified 2026-07-05 vs origin/main 202607013000.)

BEGIN;

-- ===========================================================================================
-- §1 — Feature flag (per-entity kill switch), DEFAULT OFF. Read at runtime via
--      isEnabled(client, 'PROPERTY_TAX_GL_POSTING_ENABLED', {operating_company_id}). NO global env read.
-- ===========================================================================================
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'PROPERTY_TAX_GL_POSTING_ENABLED',
  'Business-Property Allocation: property-tax accrual (Dr expense / Cr payable) + payment (Dr payable / Cr cash) GL posting. Per-entity override (TRANSP/TRK). Default OFF (kill switch) until CPA sign-off + Neon verification.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

-- ===========================================================================================
-- §2 — Role registry: widen BOTH closed-list CHECKs as a TRUE SUPERSET of main's current values
--      (0223 base + FIN-22's 4 + CODER-34's 6) + the 2 property-tax roles.
-- ===========================================================================================
ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role IN (
    -- base 12
    'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
    'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
    'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
    -- FIN-22 lessor lease
    'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
    -- CODER-34 factoring secured-borrowing
    'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
    'default_interest_expense','factor_reserve_held','factor_fee_expense',
    -- Business-Property Allocation
    'property_tax_expense','property_tax_payable'
  ));

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
    'factoring_advance_liability', 'ar_assigned_to_factor', 'factoring_recoursed_ar',
    'default_interest_expense', 'factor_reserve_held', 'factor_fee_expense',
    -- Business-Property Allocation
    'property_tax_expense', 'property_tax_payable'
  ])
);

-- ===========================================================================================
-- §3 — CREATE the two accounts for TRANSP + TRK (per-entity). Guarded by NOT EXISTS on
--      (operating_company_id, account_number OR account_name); no-op on a fresh DB lacking the company.
--      6910/2160 are unused by prior migrations for these entities (factoring used 68xx/2150, TRANSP-only).
-- ===========================================================================================
INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '6910', 'Property Taxes', 'Expense', 'OtherExpense', true
FROM org.companies c
WHERE c.code IN ('TRANSP','TRK')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '6910' OR a.account_name = 'Property Taxes')
  );

INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
SELECT c.id, '2160', 'Property Tax Payable', 'Liability', 'OtherCurrentLiability', true
FROM org.companies c
WHERE c.code IN ('TRANSP','TRK')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND (a.account_number = '2160' OR a.account_name = 'Property Tax Payable')
  );

-- ===========================================================================================
-- §4 — Seed role→account map for TRANSP + TRK (accounting.chart_of_accounts_roles). Idempotent
--      (partial unique uq_coa_roles_company_role_active → ON CONFLICT DO UPDATE). Binds by account_name
--      within the SAME operating company (never cross-entity).
-- ===========================================================================================
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
SELECT c.id, m.role, a.id, true, now(), now()
FROM org.companies c
JOIN (VALUES
  ('property_tax_expense', 'Property Taxes'),
  ('property_tax_payable', 'Property Tax Payable')
) AS m(role, account_name) ON true
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.account_name = m.account_name
 AND a.deactivated_at IS NULL
WHERE c.code IN ('TRANSP','TRK')
ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
  SET account_id = EXCLUDED.account_id, updated_at = now();

-- ===========================================================================================
-- §5 — Accrual/payment ledger. One row per rendition; carries the accrual JE + the payment JE so the
--      full lifecycle (accrue → pay) is auditable and links rendition → JEs → cash. Append-only,
--      void-not-delete. Entity-scoped FORCED RLS. Written ONLY by the poster when the flag is ON.
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS accounting.property_tax_accruals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  rendition_id          uuid NOT NULL REFERENCES compliance.property_tax_renditions(id),
  tax_year              integer NOT NULL,
  accrual_date          date NOT NULL,
  tax_amount_cents      bigint NOT NULL CHECK (tax_amount_cents > 0),
  accrual_je_id         uuid REFERENCES accounting.journal_entries(id),
  payment_date          date,
  payment_je_id         uuid REFERENCES accounting.journal_entries(id),
  status                text NOT NULL DEFAULT 'accrued'
                          CHECK (status IN ('accrued','paid','voided')),
  memo                  text,
  is_active             boolean NOT NULL DEFAULT true,
  voided_at             timestamptz,
  voided_by_user_id     uuid,
  void_reason           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid
);

-- One active accrual ledger row per rendition (re-run of the accrual poster no-ops).
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_tax_accruals_rendition_active
  ON accounting.property_tax_accruals (operating_company_id, rendition_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS property_tax_accruals_opco_year_idx
  ON accounting.property_tax_accruals (operating_company_id, tax_year) WHERE is_active;

ALTER TABLE accounting.property_tax_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.property_tax_accruals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS property_tax_accruals_select ON accounting.property_tax_accruals;
DROP POLICY IF EXISTS property_tax_accruals_write ON accounting.property_tax_accruals;
CREATE POLICY property_tax_accruals_select ON accounting.property_tax_accruals FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY property_tax_accruals_write ON accounting.property_tax_accruals FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON accounting.property_tax_accruals TO ih35_app;
REVOKE DELETE ON accounting.property_tax_accruals FROM ih35_app;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply — expect 2 role rows per entity):
--   SELECT c.code, r.role, a.account_number, a.account_name, a.account_type
--   FROM accounting.chart_of_accounts_roles r
--   JOIN catalogs.accounts a ON a.id = r.account_id
--   JOIN org.companies c ON c.id = r.operating_company_id
--   WHERE r.role IN ('property_tax_expense','property_tax_payable') ORDER BY c.code, r.role;
--   -- property_tax_expense → Expense; property_tax_payable → Liability.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   BEGIN;
--     DROP TABLE IF EXISTS accounting.property_tax_accruals;
--     DELETE FROM accounting.chart_of_accounts_roles WHERE role IN ('property_tax_expense','property_tax_payable');
--     -- delete the 2 accounts per entity only if unreferenced by any posting; re-narrow both CHECKs;
--     DELETE FROM lib.feature_flags WHERE flag_key='PROPERTY_TAX_GL_POSTING_ENABLED';
--   COMMIT;
