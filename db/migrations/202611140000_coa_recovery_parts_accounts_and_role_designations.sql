-- [FINANCIAL CLUSTER] Recovery + parts accounts and their 4 role designations.
-- Owner-directed 2026-08-02. Owner authorized agent Neon-apply (CPA ANSWERS H2: "Any agent may prepare
-- + apply Neon SQL on owner's word"; owner reaffirmed in chat 2026-08-02). POSTS NOTHING — seeds accounts
-- and designations only. No GL math, no posting-flag flip, no QBO write-back. Additive only (Rule 07).
--
-- ROOT CAUSE (verified live on br-fancy-credit-akjnd07a this session, positive control mdata.vendors=2,827):
--   FOUR CoA roles that live posters resolve are UNDESIGNATED in ALL THREE entities:
--     insurance_recovery, maintenance_parts_expense, civil_fines_expense, warranty_recovery
--   Three of them gate flags that are OFF (INSURANCE_CLAIM_RECOVERY / PARTS_PURCHASE / SAFETY_FINE).
--   The fourth is a LIVE LANDMINE: WARRANTY_REIMBURSE_GL_POSTING_ENABLED is already TRUE for TRANSP,
--   TRK and USMCA while warranty_recovery resolves to nothing — the MNT-ECON-04 poster throws
--   CoaRoleResolutionError the moment a warranty claim reimburses. It has not fired yet only because
--   maintenance.work_orders holds 2 live rows.
--
-- TREATMENTS (owner-settled, NOT shape-matched):
--   * warranty_recovery + insurance_recovery = CONTRA-EXPENSE, NEVER income. Same shape as the locked
--     damage_recovery ruling of 2026-07-23 (migration 202607800000): a recovery OFFSETS the recorded loss.
--   * maintenance_parts_expense = a DEDICATED parts line, deliberately SEPARATE from Repairs &
--     Maintenance. McLeod/trucking standard splits parts from shop labour and outside repair so that
--     cost-per-mile and warranty recovery attach to the part, not to a blended R&M bucket.
--   * civil_fines_expense = fines & penalties expense.
--
-- WHY NOT ON CONFLICT (this is load-bearing): accounting.chart_of_accounts_roles' unique index is
--   PARTIAL — uq_coa_roles_company_role_active ON (operating_company_id, role) WHERE is_active = true.
--   Postgres cannot infer a partial index from a bare ON CONFLICT (operating_company_id, role); it
--   raises "there is no unique or exclusion constraint matching the ON CONFLICT specification" — the
--   exact error that kept qbo_sync.step.vendors_pull red until PR #3993 earlier today. Every insert
--   below is guarded by NOT EXISTS instead, which is immune to partial-index inference.
--
-- NO ROLE-CHECK WIDENING NEEDED — verified live: chart_of_accounts_roles_role_check already admits all
--   four role keys. Re-stating that CHECK would risk dropping members added since the last migration
--   wrote its "superset" (the live CHECK now also carries broker_customer_advance_liability and
--   rent_expense, which the 202610060000 superset did not). We touch it not at all.
--
-- IDEMPOTENT: every statement is NOT EXISTS-guarded. Apply-twice safe. No UPDATE, no DELETE, no DROP.

BEGIN;

-- ---------------------------------------------------------------------------
-- §1 — Accounts (additive; never rename, never delete)
-- ---------------------------------------------------------------------------

-- §1.1 — Parts & Supplies Expense (6160) — TRANSP + TRK + USMCA.
-- Separate from R&M by design: parts are consumed inventory/materials, shop labour is not.
INSERT INTO catalogs.accounts (
  operating_company_id, account_number, account_name, account_type, account_subtype,
  system_purpose, is_postable
)
SELECT c.id, '6160', 'Parts & Supplies Expense', 'CostOfGoodsSold', 'SuppliesMaterialsCogs',
       'maintenance_parts_expense', true
FROM org.companies c
WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (a.account_number = '6160'
           OR a.account_name = 'Parts & Supplies Expense'
           OR a.system_purpose = 'maintenance_parts_expense')
  );

-- §1.2 — Warranty Recovery (6165) — CONTRA-EXPENSE, all three entities.
-- Sits in the VehicleRepairs family so it nets against the R&M/Parts cost it reimburses.
-- NOT TRK QBO-92 "OC-Truck Insurance Extended Warranties" — that is the COST of buying warranty
-- coverage, not a recovery against one; crediting it would net two unrelated things.
INSERT INTO catalogs.accounts (
  operating_company_id, account_number, account_name, account_type, account_subtype,
  system_purpose, is_postable, notes
)
SELECT c.id, '6165', 'Warranty Recovery', 'OtherExpense', 'VehicleRepairs',
       'warranty_recovery', true,
       'CONTRA-EXPENSE. Credit only; offsets the Repairs & Maintenance / Parts cost a warranty '
       || 'reimburses. NEVER income (owner treatment, same shape as damage_recovery 2026-07-23).'
FROM org.companies c
WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (a.account_number = '6165'
           OR a.account_name = 'Warranty Recovery'
           OR a.system_purpose = 'warranty_recovery')
  );

-- §1.3 — Insurance Claim Recovery (6155) — CONTRA-EXPENSE, all three entities.
INSERT INTO catalogs.accounts (
  operating_company_id, account_number, account_name, account_type, account_subtype,
  system_purpose, is_postable, notes
)
SELECT c.id, '6155', 'Insurance Claim Recovery', 'OtherExpense', 'VehicleRepairs',
       'insurance_recovery', true,
       'CONTRA-EXPENSE. Credit only; offsets the recorded loss an insurer reimburses. NEVER sales '
       || 'income. ASC 450-30/610-30: recognize only when probable and CAP at the recorded loss — any '
       || 'excess is a gain contingency and must not post until realized.'
FROM org.companies c
WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (a.account_number = '6155'
           OR a.account_name = 'Insurance Claim Recovery'
           OR a.system_purpose = 'insurance_recovery')
  );

-- §1.4 — Fines & Penalties (6170) — USMCA ONLY.
-- TRANSP already has QBO-83 "Fines" and TRK QBO-28 "Penalties & Settlements" (both OtherExpense /
-- PenaltiesSettlements, active, postable — verified live). USMCA mirrors them BY PURPOSE, never by
-- FK: a USMCA role row must never point at a TRANSP/TRK account (entity independence).
INSERT INTO catalogs.accounts (
  operating_company_id, account_number, account_name, account_type, account_subtype,
  system_purpose, is_postable, notes
)
SELECT c.id, '6170', 'Fines & Penalties', 'OtherExpense', 'PenaltiesSettlements',
       'civil_fines_expense', true,
       'Non-deductible for tax. Company-paid civil/regulatory fines. Driver-recoverable fines flow to '
       || 'the driver_finance.driver_liabilities subledger, not here.'
FROM org.companies c
WHERE c.code = 'USMCA'
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (a.account_number = '6170'
           OR a.account_name = 'Fines & Penalties'
           OR a.system_purpose = 'civil_fines_expense')
  );

-- ---------------------------------------------------------------------------
-- §2 — Role designations (NOT EXISTS-guarded; partial-unique-index safe)
-- ---------------------------------------------------------------------------
-- Both sides pinned to the same entity: the role row's operating_company_id AND the account's own
-- operating_company_id. This mirrors the resolver's own cross-entity-leak fix — a role row pointing at
-- another entity's account would resolve and post cross-entity on the RLS-defeated bypass poster path.
--
-- WHY THE PER-ENTITY set_config LOOP (load-bearing, learned the hard way this session): the two tables
-- do NOT have the same write policy, and a single multi-entity INSERT fails on the second one.
--   catalogs.accounts        -> policy accounts_entity_write WITH CHECK
--                               (identity.is_lucia_bypass() OR operating_company_id::text = GUC)
--                               ... so §1 succeeds under a plain lucia bypass.
--   accounting.chart_of_
--     accounts_roles         -> policy coa_roles_company_scope WITH CHECK
--                               (operating_company_id = GUC)   <-- NO is_lucia_bypass() branch
-- The WITH CHECK on the role table admits ONLY rows whose entity equals app.operating_company_id, so a
-- 3-entity INSERT raises "new row violates row-level security policy for table chart_of_accounts_roles"
-- no matter what app.bypass_rls says. (This is doc 06's "bypass is inert on AND-gated policies", in its
-- WRITE form — the read-side USING clause on this same policy DOES carry the bypass branch, which is
-- exactly why the failure is invisible until you attempt the write.) We therefore set the GUC per
-- entity and insert that entity's rows inside the loop.

DO $$
DECLARE
  ent RECORD;
  fines_acct_number text;
BEGIN
  FOR ent IN
    SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'TRK', 'USMCA') ORDER BY code
  LOOP
    -- satisfy coa_roles_company_scope WITH CHECK for THIS entity only
    PERFORM set_config('app.operating_company_id', ent.id::text, true);

    -- §2.1 — the three new per-entity accounts, matched by system_purpose within the SAME entity.
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT ent.id, r.role, a.id, true
    FROM (VALUES
      ('maintenance_parts_expense'),
      ('warranty_recovery'),
      ('insurance_recovery')
    ) AS r(role)
    JOIN catalogs.accounts a
      ON a.operating_company_id = ent.id
     AND a.system_purpose = r.role
     AND a.deactivated_at IS NULL
     AND a.is_postable = true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.chart_of_accounts_roles x
      WHERE x.operating_company_id = ent.id
        AND x.role = r.role
        AND x.is_active = true
    );

    -- §2.2 — civil_fines_expense: TRANSP -> QBO-83 "Fines"; TRK -> QBO-28 "Penalties & Settlements";
    -- USMCA -> the 6170 seeded in §1.4. Resolved by (entity, account_number) so it is portable across
    -- per-entity account ids and can never pick another entity's row.
    fines_acct_number := CASE ent.code
      WHEN 'TRANSP' THEN 'QBO-83'
      WHEN 'TRK'    THEN 'QBO-28'
      WHEN 'USMCA'  THEN '6170'
    END;

    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT ent.id, 'civil_fines_expense', a.id, true
    FROM catalogs.accounts a
    WHERE a.operating_company_id = ent.id
      AND a.account_number = fines_acct_number
      AND a.deactivated_at IS NULL
      AND a.is_postable = true
      AND NOT EXISTS (
        SELECT 1 FROM accounting.chart_of_accounts_roles x
        WHERE x.operating_company_id = ent.id
          AND x.role = 'civil_fines_expense'
          AND x.is_active = true
      );
  END LOOP;
END $$;

COMMIT;
