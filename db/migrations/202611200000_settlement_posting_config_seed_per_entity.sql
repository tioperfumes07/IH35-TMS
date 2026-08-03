-- [FINANCIAL-CLUSTER] SET-CFG-01 — materialise accounting.settlement_posting_config per operating entity.
-- POSTS NOTHING. Seeds policy-of-record rows only. Additive: INSERT ... WHERE NOT EXISTS, no UPDATE,
-- no DELETE, no schema change. Apply-twice safe.
--
-- HONEST FRAMING — THIS IS NOT A LIVE BUG FIX, AND THE EARLIER "FAIL" CALL WAS WRONG.
--   accounting.settlement_posting_config holds 0 rows on prod (verified 2026-08-03, positive control
--   mdata.vendors = 2,828). The queue recorded that as a FAILING money gate. It is not.
--   settlement-posting.service.ts:158 reads:
--       floorRaw   = driver?.net_pay_floor_pct ?? entity?.net_pay_floor_pct ?? null
--       workerClass= driver?.worker_class      ?? entity?.default_worker_classification ?? "1099"
--   and normalizeFloorPct(null) returns DEFAULT_NET_PAY_FLOOR_PCT = 0.05 (settlement-posting.math.ts:14).
--   The table's own defaults are net_pay_floor_pct 0.0500 and default_worker_classification '1099'.
--   Code default == DB default, so the 5% net-pay floor IS being enforced today and every driver is
--   already treated as 1099. Seeding changes NO settlement math. Claiming otherwise would be theatre.
--
-- WHY SEED IT ANYWAY — two real, non-cosmetic reasons:
--   1. FRAGILE COUPLING. Today the floor is correct only because a TypeScript constant happens to equal
--      a Postgres column default. Nothing enforces that agreement. Editing DEFAULT_NET_PAY_FLOOR_PCT
--      would silently move the floor for ALL THREE entities at once, with no migration, no audit row and
--      no owner decision — a wage-protection threshold changed by a one-line code edit. A materialised
--      row pins each entity's policy to data the owner controls.
--   2. OWNER-EDITABLE BY DESIGN. The table is per-entity precisely so TRANSP, TRK and USMCA can diverge.
--      With no rows there is nothing for an admin screen to read or edit, and no record of WHO set the
--      policy or WHEN — the config is invisible on the surface that is supposed to govern it.
--
-- VALUES ARE THE EXISTING EFFECTIVE POLICY, NOT A NEW ONE. Both columns are left to their DB defaults
-- (0.0500 / '1099') so the seeded rows reproduce exactly what the fallback already produces. This
-- migration is therefore a no-op on every settlement it touches, by construction. Any change to the
-- floor is a separate, explicit owner decision.
--
-- DRIVER MODEL: '1099' is correct — drivers are hired Mexican-B1 1099 contractors paid a wage/fee,
-- never a percentage of customer linehaul (owner ruling; finance-build-directive-and-driver-model).
--
-- ALL THREE ENTITIES are seeded. TRK runs no driver settlements today, but a config row is a policy
-- statement, not an activity record — and an unseeded entity is exactly how the silent-code-default
-- coupling above reappears the first time TRK ever settles a driver.
--
-- REHEARSED: 2026-08-03 on a THROWAWAY local Postgres (db setcfg_rehearse), built to the column shape
-- read from prod in this session — not the full schema, so this rehearses THIS migration's logic, not
-- its interaction with the rest of the tree. Evidence:
--   run 1  -> NOTICE "seeded 3 ... row(s)", COMMIT, count = 3
--   run 2  -> NOTICE "seeded 0 ... row(s)", COMMIT, count = 3   (idempotent)
--   values -> TRANSP/TRK/USMCA all 0.0500 / '1099'; a 4th company 'OTHER' left untouched (no row)
-- Both abort paths were mutation-tested rather than assumed:
--   floor mutated to 0.10        -> ERROR "a seeded row diverges from the effective code default"
--   config table absent          -> ERROR "refusing to seed blind"

BEGIN;

DO $$
DECLARE
  v_seeded  bigint;
  v_missing bigint;
BEGIN
  IF to_regclass('accounting.settlement_posting_config') IS NULL THEN
    RAISE EXCEPTION 'accounting.settlement_posting_config missing — refusing to seed blind';
  END IF;

  -- Column defaults carry the policy. Naming them here instead of hardcoding literals keeps this
  -- migration honest: if the DB default ever changes, the seed follows it rather than silently
  -- pinning a stale number the reviewer of THIS file believed was current.
  INSERT INTO accounting.settlement_posting_config (operating_company_id)
  SELECT c.id
  FROM org.companies c
  WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
    AND NOT EXISTS (
      SELECT 1
      FROM accounting.settlement_posting_config s
      WHERE s.operating_company_id = c.id
    );

  GET DIAGNOSTICS v_seeded = ROW_COUNT;
  RAISE NOTICE 'SET-CFG-01: seeded % settlement_posting_config row(s)', v_seeded;

  -- Post-check: every operating entity must now resolve a config row. Fails the migration rather than
  -- reporting success over a partial seed.
  SELECT count(*) INTO v_missing
  FROM org.companies c
  WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
    AND NOT EXISTS (
      SELECT 1
      FROM accounting.settlement_posting_config s
      WHERE s.operating_company_id = c.id
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'SET-CFG-01: % operating entit(y/ies) still have no settlement_posting_config row', v_missing;
  END IF;

  -- Guard the invariant this migration exists to protect: the seeded policy must equal the policy the
  -- code fallback already produces, or the seed would CHANGE settlement math instead of pinning it.
  IF EXISTS (
    SELECT 1
    FROM accounting.settlement_posting_config s
    JOIN org.companies c ON c.id = s.operating_company_id
    WHERE c.code IN ('TRANSP', 'TRK', 'USMCA')
      AND (s.net_pay_floor_pct <> 0.0500 OR s.default_worker_classification <> '1099')
  ) THEN
    RAISE EXCEPTION
      'SET-CFG-01: a seeded row diverges from the effective code default (0.0500 / 1099). This migration '
      'must be a no-op on settlement math; changing the floor is a separate owner decision.';
  END IF;
END $$;

COMMIT;
