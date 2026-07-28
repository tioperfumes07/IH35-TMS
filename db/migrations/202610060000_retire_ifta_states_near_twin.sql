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
-- Safe to re-run. Nothing is deleted and no row is touched.

DO $$
BEGIN
  IF to_regclass('catalogs.ifta_states') IS NULL THEN
    RAISE NOTICE 'catalogs.ifta_states absent — nothing to retire';
    RETURN;
  END IF;

  -- Refuse to retire a table that is NOT empty. If rows ever appear, this table is in use and the
  -- retirement decision must be re-made with that evidence in hand rather than silently applied.
  IF (SELECT count(*) FROM catalogs.ifta_states) > 0 THEN
    RAISE EXCEPTION
      'REFUSING to retire catalogs.ifta_states: it holds % row(s). Retirement was approved on the '
      'basis that it is empty and unwired — re-verify before proceeding.',
      (SELECT count(*) FROM catalogs.ifta_states);
  END IF;

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
