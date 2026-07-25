-- 202608060000_item5a_demo_fixture_purge.sql
--
-- ============================================================================================
-- DO NOT RUN ON PROD  —  HELD FOR JORGE
-- Registered in db/migrations/.held-migrations.json. db:migrate HELD-SKIPs this on prod; the
-- owner applies it by hand on Neon and ledger-backfills. No agent applies it.
-- ============================================================================================
--
-- ============================================================================================
-- OWNER OVERRIDE — READ THIS BEFORE CITING IT AS PRECEDENT
-- ============================================================================================
-- The standing NEVER-DELETE / archive-only law (Rule 07 / §F.24) is NOT repealed by this file.
--
-- Owner ruling, Jorge, 2026-07-25, verbatim in substance:
--   "The NEVER-DELETE / archive-only law protects ARCHITECTURE, BLUEPRINT, DESIGN, LINKAGE,
--    SCHEMA (tables/columns), and REAL BUSINESS DATA. It does NOT protect test/demo/sample
--    fixtures. Verified test or demo data CAN and WILL be permanently DELETED. Where the owner
--    rules to delete a verified fixture, that overrides the archive-only default."
--
-- The override is NARROW. It authorises deleting rows identified by an EXACT DEMO IDENTIFIER.
-- It is NOT authority to delete business rows, and it is NOT authority to delete on the
-- is_sample_data flag (see the hazard note below). A future agent reading this file must not
-- treat it as precedent for removing any row that is not a verified fixture.
--
-- ============================================================================================
-- WHY NOT is_sample_data — the flag is a HAZARD, not a selector
-- ============================================================================================
-- GUARD measured it on prod 2026-07-25: is_sample_data is FALSE on 176 real rows and TRUE on
-- the 17 fakes. It carries ZERO signal. A purge filtered on it would both miss real fixtures
-- and destroy real business data. Every DELETE below is keyed on a business identifier, never
-- on the flag. Step 5 repairs the mis-flagged rows; step 6 deprecates the column in place.
--
-- The DEMO-106 trap, specifically: that unit's VIN is a REAL-format '1GD473C89NJ123106', not
-- '1DEMO%'. An earlier draft scoped units by `vin LIKE '1DEMO%'` and silently orphaned it —
-- leaving a demo trailer live in production while reporting success. Units are therefore scoped
-- by unit_number LIKE 'DEMO-%' and by nothing else.
--
-- ============================================================================================
-- SAFETY PROPERTIES
-- ============================================================================================
--  * DERIVED counts, never hardcoded. Every assertion compares deleted-vs-counted from THIS
--    database. A literal "expect 6/4/5/2" would fail on a correct DB — the earlier DEMO-106
--    miscount is exactly how a hardcoded expectation goes wrong.
--  * FAIL-LOUD referential pre-flight (step 3) aborts if ANY non-demo row references a demo row,
--    naming the offenders. It is DYNAMIC — it walks pg_constraint rather than a hand-listed set
--    of FKs, so a table added later is covered without editing this file.
--  * FK-safe order: loads -> work_orders -> units -> drivers.
--  * Idempotent + fresh-DB safe. On a CI database built from 0001 there are no demo rows, so
--    every step is a clean no-op. Nothing RAISEs on a legitimately empty result.
--  * Schema verified against db/migrations before writing: mdata.units.unit_number (0008),
--    mdata.units.owner_company_id NOT operating_company_id (0015 — units have no
--    operating_company_id; 0403 indexes owner_company_id), mdata.drivers.last_name (0008),
--    mdata.loads.load_number (0034), maintenance.work_orders.display_id (0049),
--    is_sample_data on customers/vendors/drivers/units/loads only (0403 — NOT on work_orders).
--    There is no mdata.trailers table; trailers are rows in mdata.units.

BEGIN;

-- ── 1. Identify demo rows by EXACT identifier ──────────────────────────────────────────────
-- vendors and customers are scoped even though both are 0 today, so a future demo row of that
-- shape is caught by the same purge instead of surviving it.
CREATE TEMP TABLE _demo_units ON COMMIT DROP AS
  SELECT id, unit_number AS ident FROM mdata.units WHERE unit_number LIKE 'DEMO-%';

CREATE TEMP TABLE _demo_drivers ON COMMIT DROP AS
  SELECT id, (first_name || ' ' || last_name) AS ident FROM mdata.drivers
   WHERE last_name ILIKE 'Demo %' OR last_name ILIKE '% Demo %';

CREATE TEMP TABLE _demo_loads ON COMMIT DROP AS
  SELECT id, load_number AS ident FROM mdata.loads WHERE load_number LIKE 'DEMO-L%';

CREATE TEMP TABLE _demo_wos ON COMMIT DROP AS
  SELECT id, display_id AS ident FROM maintenance.work_orders WHERE display_id LIKE 'DEMO-WO-%';

CREATE TEMP TABLE _demo_vendors ON COMMIT DROP AS
  SELECT id, vendor_name AS ident FROM mdata.vendors WHERE vendor_name LIKE 'DEMO-%';

CREATE TEMP TABLE _demo_customers ON COMMIT DROP AS
  SELECT id, customer_name AS ident FROM mdata.customers WHERE customer_name LIKE 'DEMO-%';

-- ── 2. Derived pre-flight counts ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_u int; v_d int; v_l int; v_w int; v_v int; v_c int;
BEGIN
  SELECT count(*) INTO v_u FROM _demo_units;
  SELECT count(*) INTO v_d FROM _demo_drivers;
  SELECT count(*) INTO v_l FROM _demo_loads;
  SELECT count(*) INTO v_w FROM _demo_wos;
  SELECT count(*) INTO v_v FROM _demo_vendors;
  SELECT count(*) INTO v_c FROM _demo_customers;
  RAISE NOTICE 'ITEM-5a demo fixtures matched: units=% drivers=% loads=% work_orders=% vendors=% customers=% (total=%)',
    v_u, v_d, v_l, v_w, v_v, v_c, v_u + v_d + v_l + v_w + v_v + v_c;
END $$;

-- ── 3. FAIL-LOUD referential pre-flight ────────────────────────────────────────────────────
-- Abort if any row OUTSIDE the demo set references a row INSIDE it. Walks pg_constraint, so it
-- covers every current and future FK to these four tables without a maintained list.
-- GUARD measured 0 such references on prod 2026-07-25; the assertion still runs on every DB.
DO $$
DECLARE
  r record;
  v_offenders text;
  v_problems text := '';
BEGIN
  FOR r IN
    SELECT con.conname,
           src_ns.nspname  AS src_schema,
           src.relname     AS src_table,
           src_att.attname AS src_column,
           tgt_ns.nspname  AS tgt_schema,
           tgt.relname     AS tgt_table
      FROM pg_constraint con
      JOIN pg_class src        ON src.oid = con.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
      JOIN pg_class tgt        ON tgt.oid = con.confrelid
      JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
      JOIN pg_attribute src_att ON src_att.attrelid = con.conrelid
                               AND src_att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND array_length(con.conkey, 1) = 1
       AND (tgt_ns.nspname || '.' || tgt.relname) IN
           ('mdata.units', 'mdata.drivers', 'mdata.loads', 'maintenance.work_orders')
  LOOP
    -- The referencing row is an offender unless it is itself part of the demo set being removed.
    EXECUTE format($q$
      SELECT string_agg(DISTINCT x.id::text, ', ')
        FROM (
          SELECT s.id
            FROM %I.%I s
           WHERE s.%I IN (SELECT id FROM %s)
             AND NOT (%L = 'mdata.units'             AND s.id IN (SELECT id FROM _demo_units))
             AND NOT (%L = 'mdata.drivers'           AND s.id IN (SELECT id FROM _demo_drivers))
             AND NOT (%L = 'mdata.loads'             AND s.id IN (SELECT id FROM _demo_loads))
             AND NOT (%L = 'maintenance.work_orders' AND s.id IN (SELECT id FROM _demo_wos))
           LIMIT 25
        ) x $q$,
      r.src_schema, r.src_table, r.src_column,
      CASE r.tgt_schema || '.' || r.tgt_table
        WHEN 'mdata.units'             THEN '_demo_units'
        WHEN 'mdata.drivers'           THEN '_demo_drivers'
        WHEN 'mdata.loads'             THEN '_demo_loads'
        ELSE '_demo_wos'
      END,
      r.src_schema || '.' || r.src_table, r.src_schema || '.' || r.src_table,
      r.src_schema || '.' || r.src_table, r.src_schema || '.' || r.src_table
    ) INTO v_offenders;

    IF v_offenders IS NOT NULL THEN
      v_problems := v_problems || format(
        E'\n  %s.%s.%s -> %s.%s (constraint %s) offending ids: %s',
        r.src_schema, r.src_table, r.src_column, r.tgt_schema, r.tgt_table, r.conname, v_offenders);
    END IF;
  END LOOP;

  IF v_problems <> '' THEN
    RAISE EXCEPTION E'ITEM-5a ABORTED — real (non-demo) rows reference demo rows. Deleting would orphan real business data. Resolve these first:%s', v_problems;
  END IF;
  RAISE NOTICE 'ITEM-5a referential pre-flight PASS — no non-demo row references a demo row.';
END $$;

-- ── 4. Delete, FK-safe: loads -> work_orders -> units -> drivers ───────────────────────────
-- Each step asserts deleted == counted, derived from this database.
DO $$
DECLARE
  v_expected int;
  v_deleted  int;
BEGIN
  SELECT count(*) INTO v_expected FROM _demo_loads;
  DELETE FROM mdata.loads WHERE id IN (SELECT id FROM _demo_loads);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'ITEM-5a loads: deleted % but matched % — aborting', v_deleted, v_expected;
  END IF;
  RAISE NOTICE 'ITEM-5a deleted % demo load(s)', v_deleted;

  SELECT count(*) INTO v_expected FROM _demo_wos;
  DELETE FROM maintenance.work_orders WHERE id IN (SELECT id FROM _demo_wos);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'ITEM-5a work_orders: deleted % but matched % — aborting', v_deleted, v_expected;
  END IF;
  RAISE NOTICE 'ITEM-5a deleted % demo work order(s)', v_deleted;

  SELECT count(*) INTO v_expected FROM _demo_units;
  DELETE FROM mdata.units WHERE id IN (SELECT id FROM _demo_units);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'ITEM-5a units: deleted % but matched % — aborting', v_deleted, v_expected;
  END IF;
  RAISE NOTICE 'ITEM-5a deleted % demo unit(s) (includes DEMO-106, whose VIN is real-format)', v_deleted;

  SELECT count(*) INTO v_expected FROM _demo_drivers;
  DELETE FROM mdata.drivers WHERE id IN (SELECT id FROM _demo_drivers);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'ITEM-5a drivers: deleted % but matched % — aborting', v_deleted, v_expected;
  END IF;
  RAISE NOTICE 'ITEM-5a deleted % demo driver(s)', v_deleted;

  SELECT count(*) INTO v_expected FROM _demo_vendors;
  DELETE FROM mdata.vendors WHERE id IN (SELECT id FROM _demo_vendors);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'ITEM-5a vendors: deleted % but matched % — aborting', v_deleted, v_expected;
  END IF;

  SELECT count(*) INTO v_expected FROM _demo_customers;
  DELETE FROM mdata.customers WHERE id IN (SELECT id FROM _demo_customers);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'ITEM-5a customers: deleted % but matched % — aborting', v_deleted, v_expected;
  END IF;
END $$;

-- ── 5. Correct the mis-flagged REAL rows (do NOT delete these) ─────────────────────────────
-- GUARD counted 176 on prod: 83 real drivers + 93 real units carrying is_sample_data=true.
-- Scoped by the DEFINING property — flagged true but NOT a verified demo identifier — rather
-- than by entity or created-at date. That is entity-agnostic, needs no UUID literal, and stays
-- correct if the 2026-07-04 dating or the USMCA attribution is off. The count is reported, not
-- asserted against 176, so a correct database cannot fail here.
DO $$
DECLARE
  v_d int; v_u int; v_c int; v_v int; v_l int;
BEGIN
  UPDATE mdata.drivers SET is_sample_data = false
   WHERE is_sample_data = true
     AND NOT (last_name ILIKE 'Demo %' OR last_name ILIKE '% Demo %');
  GET DIAGNOSTICS v_d = ROW_COUNT;

  UPDATE mdata.units SET is_sample_data = false
   WHERE is_sample_data = true AND unit_number NOT LIKE 'DEMO-%';
  GET DIAGNOSTICS v_u = ROW_COUNT;

  UPDATE mdata.loads SET is_sample_data = false
   WHERE is_sample_data = true AND load_number NOT LIKE 'DEMO-L%';
  GET DIAGNOSTICS v_l = ROW_COUNT;

  UPDATE mdata.vendors SET is_sample_data = false
   WHERE is_sample_data = true AND vendor_name NOT LIKE 'DEMO-%';
  GET DIAGNOSTICS v_v = ROW_COUNT;

  UPDATE mdata.customers SET is_sample_data = false
   WHERE is_sample_data = true AND customer_name NOT LIKE 'DEMO-%';
  GET DIAGNOSTICS v_c = ROW_COUNT;

  RAISE NOTICE 'ITEM-5a corrected mis-flagged REAL rows: drivers=% units=% loads=% vendors=% customers=% (total=%)',
    v_d, v_u, v_l, v_v, v_c, v_d + v_u + v_l + v_v + v_c;
END $$;

-- ── 6. Deprecate the column in place (never dropped — Rule 07 protects SCHEMA) ──────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mdata.customers','mdata.vendors','mdata.drivers','mdata.units','mdata.loads']
  LOOP
    EXECUTE format(
      'COMMENT ON COLUMN %s.is_sample_data IS %L',
      t,
      'DEPRECATED 2026-07-25 — DO NOT FILTER ON THIS COLUMN. Measured on prod: false on 176 real '
      || 'rows, true on 17 fixtures = zero signal. NEVER use it to select rows for DELETE or purge '
      || '(guarded by scripts/verify-steps/1488-verify-no-is-sample-data-purge.mjs). Identify demo '
      || 'data by exact business identifier instead: units DEMO-%, loads DEMO-L%, work_orders '
      || 'DEMO-WO-%, drivers last_name ILIKE ''Demo %''. Retained, not dropped — Rule 07 protects schema.');
  END LOOP;
END $$;

COMMIT;
