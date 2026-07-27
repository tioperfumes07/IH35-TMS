-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] SET-02 — Driver Net-Pay Clearing = LIABILITY (not Cash Advance).
--
-- *** DO NOT RUN ON PROD via db:migrate. Registered in .held-migrations.json. Owner/agent Neon-applies
--     then ledger-backfills. POSTS NOTHING. No posting-flag flip. No QBO write-back. ***
--
-- ROOT CAUSE: FIN-18 credits net pay to role `driver_payroll_clearing`. On prod (2026-07-26) that role
-- was bound to the SAME Asset account as `advance_recovery` ("Driver Cash Advance" / QBO-149) for TRK
-- and USMCA — so a settlement credit would contaminate the advance receivable. TRANSP was hand-fixed
-- to catalogs.accounts 2170 "Driver Net-Pay Clearing" (Liability / OtherCurrentLiability); TRK+USMCA
-- still point at the Cash Advance asset. catalogs.account_role_bindings is empty — the live map is
-- accounting.chart_of_accounts_roles.
--
-- FIX: idempotently provision 2170 for TRANSP/TRK/USMCA; rebind active driver_payroll_clearing rows
-- to that Liability account. NEVER touch advance_recovery. Resolve companies by code (no hardcoded UUID).
--
-- Standard: QuickBooks/NetSuite payroll/net-pay clearing = Other Current Liability the payout drains.

BEGIN;

-- §1 — Provision the liability account (all three testing entities).
INSERT INTO catalogs.accounts (
  operating_company_id,
  account_number,
  account_name,
  account_type,
  account_subtype,
  is_postable
)
SELECT c.id, '2170', 'Driver Net-Pay Clearing', 'Liability', 'OtherCurrentLiability', true
FROM org.companies c
WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (a.account_number = '2170' OR a.account_name = 'Driver Net-Pay Clearing')
  );

-- §2 — Rebind PRIMARY role map (accounting.chart_of_accounts_roles).
-- Deactivate any active binding that still points at a non-Liability / shared advance account, then
-- upsert the correct liability binding. ON CONFLICT on the partial unique (opco, role) WHERE is_active.
-- NEVER touch advance_recovery.
DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'SET-02: accounting.chart_of_accounts_roles absent — skip rebind';
    RETURN;
  END IF;

  FOR rec IN
    SELECT c.id AS company_id, c.code
    FROM org.companies c
    WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
  LOOP
    SELECT a.id INTO v_acct
    FROM catalogs.accounts a
    WHERE a.operating_company_id = rec.company_id
      AND a.deactivated_at IS NULL
      AND a.account_number = '2170'
      AND a.account_name = 'Driver Net-Pay Clearing'
      AND a.account_type = 'Liability'
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'SET-02: missing 2170 Driver Net-Pay Clearing for company %', rec.code;
    END IF;

    -- Soft-retire a wrong active binding (different account) so the partial unique allows the upsert.
    UPDATE accounting.chart_of_accounts_roles r
       SET is_active = false,
           updated_at = now()
     WHERE r.operating_company_id = rec.company_id
       AND r.role = 'driver_payroll_clearing'
       AND r.is_active = true
       AND r.account_id IS DISTINCT FROM v_acct;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'driver_payroll_clearing', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  END LOOP;
END
$$;

COMMIT;

-- Read-only verify (harmless on re-run)
SELECT o.code,
       a.account_number,
       a.account_type,
       (SELECT count(*) FROM accounting.chart_of_accounts_roles r
         WHERE r.operating_company_id = o.id
           AND r.role = 'driver_payroll_clearing'
           AND r.is_active
           AND r.account_id = a.id) AS bound_active
FROM org.companies o
JOIN catalogs.accounts a
  ON a.operating_company_id = o.id
 AND a.account_number = '2170'
 AND a.account_name = 'Driver Net-Pay Clearing'
WHERE o.code IN ('TRANSP', 'TRK', 'USMCA')
ORDER BY o.code;
