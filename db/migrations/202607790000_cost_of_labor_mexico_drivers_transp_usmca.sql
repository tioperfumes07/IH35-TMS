-- [HOLD-FOR-JORGE — TIER 1 · §1.4 FINANCIAL CLUSTER]
-- Seed "Cost of Labor–Mexico Drivers" on TRANSP + USMCA (lane defect B / WO item 4).
--
-- *** DO NOT RUN ON PROD via a normal deploy. Applied on prod by owner hand-apply 2026-07-25
--     (see db/migrations/.held-migrations.json applied_evidence) — this marker stays so the
--     registry/marker parity guard (verify-hold-migrations-registered) keeps tracking it and
--     db-migrate.mjs's held-skip logic still recognizes it as owner-applied-only, not a normal
--     pending migration. ***
--
-- ROOT CAUSE: driver_pay_expense cannot be designated on TRANSP/USMCA because the expense
-- account existed only on TRK (QBO-204 CL-Contractor Labor Mexico Driver-(689)). Settlements
-- run on TRANSP (+ USMCA). CPA locked name: "Cost of Labor–Mexico Drivers".
--
-- TRK reference (structure only): CostOfGoodsSold / CostOfLaborCos / is_postable=true.
--
-- OWNER RULING 2026-07-25 (chat): no external/QBO number — use INTERNAL TMS numbers.
--   TRANSP account_number = 6890
--   USMCA  account_number = 6890
--   (unique per entity under uq_accounts_company_account_number; mirrors TRK's "689" labor family)
--
-- Resolve entities BY org.companies.code — never hardcode UUIDs.
-- After seed: designate driver_pay_expense → this account per entity (separate Neon paste).

BEGIN;

INSERT INTO catalogs.accounts
  (account_number, account_name, account_type, account_subtype,
   is_postable, currency_code, operating_company_id)
SELECT
  v.account_number,
  v.account_name,
  v.account_type,
  v.account_subtype,
  true,
  'USD',
  c.id
FROM (VALUES
  ('TRANSP'::text, '6890'::text, 'Cost of Labor–Mexico Drivers'::text, 'CostOfGoodsSold'::text, 'CostOfLaborCos'::text),
  ('USMCA'::text,  '6890'::text, 'Cost of Labor–Mexico Drivers'::text, 'CostOfGoodsSold'::text, 'CostOfLaborCos'::text)
) AS v(company_code, account_number, account_name, account_type, account_subtype)
JOIN org.companies c ON c.code = v.company_code AND c.deactivated_at IS NULL
WHERE v.account_number IS NOT NULL
  AND length(trim(v.account_number)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (
        a.account_number = v.account_number
        OR lower(a.account_name) = lower(v.account_name)
      )
  )
ON CONFLICT (operating_company_id, account_number) DO NOTHING;

COMMIT;

-- POST-DEPLOY VERIFY:
--   SELECT set_config('app.bypass_rls','lucia',true);
--   SELECT c.code, a.account_number, a.account_name, a.account_type, a.account_subtype
--   FROM catalogs.accounts a
--   JOIN org.companies c ON c.id = a.operating_company_id
--   WHERE a.account_name = 'Cost of Labor–Mexico Drivers'
--     AND c.code IN ('TRANSP','USMCA');
