-- DRIVER ENTITY DEFAULT (business rule): a driver must never be entity-less.
-- TRANSP (IH 35 Transportation) is the only driver-bearing entity (TRK is asset-holder, USMCA inactive),
-- and all 81 prod drivers already have operating_company_id = TRANSP (GUARD measured: 0 null). The create
-- endpoint now defaults operating_company_id to TRANSP (by code) when not supplied; this NOT NULL
-- constraint is the hard backstop so no path can ever produce an entity-less driver.
--
-- mdata only — disjoint from Path B. Idempotent. Reversible: ALTER COLUMN ... DROP NOT NULL.

BEGIN;

-- Defensive backfill (no-op on prod; guards CI/other envs): any null -> TRANSP by stable code.
UPDATE mdata.drivers
   SET operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1)
 WHERE operating_company_id IS NULL;

ALTER TABLE mdata.drivers ALTER COLUMN operating_company_id SET NOT NULL;

COMMIT;
