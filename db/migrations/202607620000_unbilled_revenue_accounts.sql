-- Unbilled Revenue (contract asset, ASC 606 two-event revenue latch)
--
-- Adds ONE postable asset account per ACTIVE FREIGHT carrier: TRANSP + USMCA.
-- TRK is EXCLUDED — prod-verified 2026-07-20 on br-fancy-credit-akjnd07a: TRK is the lessor entity
-- (income accounts are Equipment Rental / Equipment Lease / Sales of Fixed Assets — no freight or
-- line-haul income account) and books 0 freight loads. A freight contract asset there would be a
-- permanent orphan.
--
--   Event 1 (delivery): DR Unbilled Revenue / CR Line-haul Income   (earned, not yet billed)
--   Event 2 (invoice):  DR Accounts Receivable / CR Unbilled Revenue (relieved when invoiced)
--
-- Credit legs (prod-verified active): TRANSP 4100 Freight Revenue · USMCA 4000 Freight / Line-haul Income.
-- Forward-only — no backfill.
--
-- POSTS NOTHING. This creates the chart-of-accounts prerequisite ONLY. The posting engine stays gated
-- behind REVENUE_RECOGNITION_POST_ENABLED (separate switch, default OFF, owner-flipped per entity).
--
-- account_subtype 'Other Current Assets' (with spaces) is the LOCAL/TMS-authored spelling, matching the
-- precedent set by TRANSP 1295 (Relay Fuel Wallet) and USMCA 1200 — NOT the QBO API enum
-- 'OtherCurrentAssets', which is reserved for QBO-mirrored rows carrying a qbo_account_id.
--
-- Entity ids are resolved BY CODE from org.companies and are NEVER hardcoded. Hardcoded UUIDs resolve
-- correctly on prod but NOT on the fresh CI database (migrate-from-0001), where seeded companies get
-- different ids — that previously caused an accounts_operating_company_id_fkey violation
-- (see 202606272100_af1_catalogs_accounts_per_entity.sql). Resolving by code is prod-identical and
-- fresh-DB safe, and no-ops gracefully (never RAISEs) if an entity is absent.
--
-- Idempotent: safe to re-run. Guarded on BOTH the (operating_company_id, account_number) unique index
-- and on system_purpose, so a re-run cannot create a duplicate contract asset under a different number.
--
-- FINANCIAL CLUSTER (catalogs.accounts) — OWNER APPROVES THE MERGE. DO NOT SELF-MERGE. §1.4.

BEGIN;

INSERT INTO catalogs.accounts
  (account_number, account_name, account_type, account_subtype, system_purpose,
   is_postable, currency_code, operating_company_id)
SELECT
  v.account_number,
  'Unbilled Revenue',
  'Asset',
  'Other Current Assets',
  'unbilled_revenue',
  true,
  'USD',
  c.id
FROM (VALUES
  ('TRANSP', '1240'),
  ('USMCA',  '1150')
) AS v(company_code, account_number)
JOIN org.companies c ON c.code = v.company_code
WHERE NOT EXISTS (
  SELECT 1
  FROM catalogs.accounts a
  WHERE a.operating_company_id = c.id
    AND a.system_purpose = 'unbilled_revenue'
)
ON CONFLICT (operating_company_id, account_number) DO NOTHING;

COMMIT;
