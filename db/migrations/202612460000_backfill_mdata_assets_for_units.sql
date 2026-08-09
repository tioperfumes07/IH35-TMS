-- FAIL-INS-POLICY-ASSET-404 — backfill mdata.assets for units that have none, and link unit_id.
--
-- MEASURED ON PROD (br-fancy-credit-akjnd07a) BEFORE WRITING THIS:
--   mdata.assets                     43 rows TOTAL
--     … tenant_id = USMCA             0
--     … unit_id NOT NULL              0   (across ALL 43, every tenant)
--   mdata.units (USMCA)              40 rows
--
-- insurance.policy_unit.asset_id references mdata.assets, and the wizard resolver
-- (resolve-asset-id.shared.ts) maps a picked mdata.units.id -> mdata.assets.id through
-- `a.id = $2 OR a.unit_id = $2 OR a.unit_code IN (SELECT unit_number ...)`, all under
-- `a.tenant_id = $1`. With zero USMCA asset rows EVERY branch is dead, so
-- POST /insurance/policies/with-bills 404s `asset_not_found` for every unit.
--
-- WHAT THIS DOES *NOT* DO, deliberately:
--   · It does not widen or drop `a.tenant_id` — that would make one company resolve another
--     company's asset. Three PRs tonight (#5082/#5088/#5089) added exactly that predicate to
--     insurance writes; loosening it here would undo them in the opposite direction.
--   · It invents no financial values. `insured_value_cents` and `acquisition_cost_cents` are left
--     NULL, not zero: NULL says "not stated", 0 would assert a valued-at-nothing asset into a table
--     insurance reads. The owner supplies real insured values.
--
-- The backfill is derived ONLY from columns the unit already has. It is idempotent (ON CONFLICT on
-- the natural key) and additive; it archives nothing and updates no existing asset row.
--
-- assets_tenant_id_unit_code_key = UNIQUE (tenant_id, unit_code) is the natural key.

DO $$
DECLARE
  minted integer := 0;
  linked integer := 0;
BEGIN
  IF to_regclass('mdata.assets') IS NULL OR to_regclass('mdata.units') IS NULL THEN
    RAISE NOTICE 'FAIL-INS-POLICY-ASSET-404: mdata.assets or mdata.units absent — nothing to do';
    RETURN;
  END IF;

  -- 1) Mint one asset per live unit that has none, for the company that OPERATES the unit.
  --    COALESCE(currently_leased_to, owner) mirrors the tenancy rule used everywhere else for
  --    mdata.units (the lessee operates it; TRK owns but does not run it).
  WITH candidate AS (
    SELECT
      u.id                                                        AS unit_id,
      COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS tenant_id,
      u.unit_number                                               AS unit_code,
      u.vin, u.make, u.model, u.year
    FROM mdata.units u
    WHERE u.deactivated_at IS NULL
      AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) IS NOT NULL
      AND u.unit_number IS NOT NULL
  ), ins AS (
    INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, vin, make, model, year, status, unit_id)
    SELECT c.tenant_id, c.unit_code, 'tractor', c.vin, c.make, c.model, c.year, 'active', c.unit_id
    FROM candidate c
    ON CONFLICT (tenant_id, unit_code) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO minted FROM ins;

  -- 2) Repair the dead branch: existing assets matched by unit_code but never linked by unit_id.
  --    Only fills NULLs — never repoints an asset that already names a unit.
  WITH upd AS (
    UPDATE mdata.assets a
       SET unit_id = u.id,
           updated_at = now()
      FROM mdata.units u
     WHERE a.unit_id IS NULL
       AND u.deactivated_at IS NULL
       AND a.unit_code = u.unit_number
       AND a.tenant_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
    RETURNING 1
  )
  SELECT count(*) INTO linked FROM upd;

  RAISE NOTICE 'FAIL-INS-POLICY-ASSET-404: minted % asset(s), linked unit_id on % existing asset(s)', minted, linked;
END
$$;
