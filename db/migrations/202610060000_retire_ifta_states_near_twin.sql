-- C11 / FUEL-07 follow-up — retire the catalogs.ifta_states near-twin (ARCHIVE, never DROP).
--
-- ROOT CAUSE: two catalogs both claimed to be "the IFTA jurisdiction list". That is a permanent
-- split-brain risk: a future block could wire the wrong one and file a return against a jurisdiction
-- set nobody maintained. Verified on prod 2026-07-28 which is which:
--   · catalogs.fuel_tax_jurisdictions — WIRED to the fuel route
--     (createCatalogRoutes tableName:"fuel_tax_jurisdictions", urlSegment "tax-jurisdictions") and
--     POPULATED: 174 rows = the 58 IFTA members x 3 active companies.
--   · catalogs.ifta_states — UNWIRED (no apps/ consumer; the only repo reference is a line in
--     scripts/canonical-relations.json) and EMPTY: count(*) = 0 AND n_live_tup = 0.
-- An incoming spec asserted ifta_states was "seeded by 0062"; the live count refutes that. It has a
-- migration, not rows.
--
-- WHY STOP-WRITE RATHER THAN DROP (Rule 07 NEVER-DELETE): dropping a table forecloses recovery and
-- destroys the audit answer to "what was this?". The sanctioned retirement is: revoke the ability to
-- WRITE, keep the ability to READ, and label the table so the next reader is told where canonical
-- lives. The table, its policy and its grants-to-read all survive.
--
-- IDEMPOTENT: REVOKE of a privilege already absent is a no-op, and COMMENT ON overwrites in place.
-- Safe to re-run on a populated or an empty table. Nothing is deleted and no row is touched.

DO $$
BEGIN
  IF to_regclass('catalogs.ifta_states') IS NULL THEN
    RAISE NOTICE 'catalogs.ifta_states absent — nothing to retire';
    RETURN;
  END IF;

  -- CORRECTION (2026-07-28): an earlier draft REFUSED to proceed when the table was non-empty, on the
  -- belief that it was never seeded anywhere. CI's fresh-database run disproved that immediately —
  -- migration 0062 seeds catalogs.ifta_states with 15 rows, so a from-scratch database HAS rows even
  -- though prod has none. The guard was therefore wrong, not the database.
  --
  -- Emptiness was never the real basis for retirement; being UNWIRED is. No application code reads or
  -- writes this table (enforced by verify-ifta-single-canonical-catalog), and the retirement is
  -- non-destructive — stop-write plus a label, with SELECT preserved and not one row touched. That is
  -- correct whether the table holds 0 rows or 15. The count is recorded for the audit trail instead of
  -- aborting.
  RAISE NOTICE 'catalogs.ifta_states holds % row(s) at retirement (prod: 0; fresh DB: 15 seeded by 0062) — '
               'archiving read-only, no rows are modified',
               (SELECT count(*) FROM catalogs.ifta_states);

  -- Stop-write. SELECT is deliberately preserved: archive, not delete.
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON catalogs.ifta_states FROM ih35_app;

  COMMENT ON TABLE catalogs.ifta_states IS
    'DEPRECATED 2026-07-28 (C11 near-twin retirement, owner-approved). NOT the canonical IFTA '
    'jurisdiction catalog. Canonical = catalogs.fuel_tax_jurisdictions, which is wired to '
    '/api/v1/catalogs/fuel/tax-jurisdictions and holds the 58 IFTA member jurisdictions per company. '
    'This table is UNWIRED and EMPTY; write privileges were revoked from ih35_app to prevent a second '
    'divergent jurisdiction list. Retained read-only for audit history — do NOT drop, and do NOT wire '
    'new code to it.';
END
$$;
