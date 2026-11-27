-- SCENTSX B1 (2 of 2) — the ScentsX LLC company row (TIO Perfumes).
--
-- Owner 2026-11-26 20:13 CT "Own company, same engine"; 20:16 CT "a full accounting engine … complete wiring to
-- ledgers, liabilities, assets"; 20:18 CT inventories, warehouses, retail locations, price levels, credit limits,
-- approvals, cash compliance. Design: https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC (B1).
--
-- Only facts the owner has given are written: the legal name ScentsX LLC and the trade name TIO Perfumes. EIN,
-- address, phone and email stay NULL until the owner gives them (design D1) — never guessed. code 'SCENTSX' is the
-- stable slug; the id is generated (resolve by code, never hard-code the UUID).
--
-- Access: the Owner already reaches every active company through org.user_accessible_company_ids(); the explicit
-- grant below is written for each user on the TIO Perfumes desk list (perfume.desk_users), so the desk user and the
-- company user are the same people and nobody else gains ScentsX. Idempotent (ON CONFLICT / NOT EXISTS).
-- No money row, no account, no period is written here — those are B2 (202616830100).

BEGIN;

INSERT INTO org.companies (code, legal_name, short_name, company_type, country, is_active)
VALUES ('SCENTSX', 'ScentsX LLC', 'TIO Perfumes', 'distributor', 'US', true)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('perfume.desk_users') IS NOT NULL THEN
    INSERT INTO org.user_company_access (user_id, company_id)
    SELECT du.user_id, c.id
      FROM perfume.desk_users du
      JOIN org.companies c ON c.code = 'SCENTSX'
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;
END $$;

COMMIT;
