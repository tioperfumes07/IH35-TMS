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

-- ── 0. RLS BYPASS — REQUIRED, and the reason is a near-miss worth recording ────────────────
-- mdata.units / drivers / loads carry FORCE ROW LEVEL SECURITY, which applies policies even to the
-- table owner. Run without this and every demo row is INVISIBLE: step 2 reports
-- "matched: units=0 drivers=0 loads=0 work_orders=0 (total=0)" and every derived assertion in step 4
-- passes TRIVIALLY, because deleted == counted == 0. The migration would COMMIT, delete nothing, and
-- report a clean run — a silent no-op indistinguishable from a successful purge.
-- That is exactly what happened on the first prod attempt (2026-07-25); only an unrelated error
-- stopped it. A zero match must never be mistaken for success — see the guard in step 2.
SET LOCAL app.bypass_rls = 'lucia';

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
  v_visible_units bigint; v_est_units bigint;
BEGIN
  SELECT count(*) INTO v_u FROM _demo_units;
  SELECT count(*) INTO v_d FROM _demo_drivers;
  SELECT count(*) INTO v_l FROM _demo_loads;
  SELECT count(*) INTO v_w FROM _demo_wos;
  SELECT count(*) INTO v_v FROM _demo_vendors;
  SELECT count(*) INTO v_c FROM _demo_customers;
  RAISE NOTICE 'ITEM-5a demo fixtures matched: units=% drivers=% loads=% work_orders=% vendors=% customers=% (total=%)',
    v_u, v_d, v_l, v_w, v_v, v_c, v_u + v_d + v_l + v_w + v_v + v_c;

  -- ZERO IS NOT ABSENCE. If nothing matched but mdata.units plainly holds rows, the session is
  -- almost certainly RLS-masked rather than genuinely clean, and continuing would report a
  -- successful purge that deleted nothing. Fail loudly instead. A genuinely-clean database (already
  -- purged, or a fresh CI database from 0001) has no visible units either, so this cannot misfire
  -- there: it only trips when rows exist AND none are visible.
  IF (v_u + v_d + v_l + v_w + v_v + v_c) = 0 THEN
    -- Discriminate MASKED from genuinely-CLEAN using an RLS-IMMUNE signal. A visible count cannot do
    -- it: under FORCE RLS a masked session sees 0 everywhere, and an already-purged database also
    -- sees 0 demo rows — the two are indistinguishable from inside the policy. pg_class.reltuples is
    -- catalog metadata and is not filtered by RLS, so it reveals rows the session cannot read.
    --   masked        -> visible units = 0 BUT reltuples > 0   -> ABORT
    --   already clean -> visible units > 0 (the real fleet)    -> proceed as a no-op
    --   fresh CI DB   -> visible 0 AND reltuples 0             -> proceed as a no-op
    SELECT count(*) INTO v_visible_units FROM mdata.units;
    SELECT COALESCE(reltuples, 0)::bigint INTO v_est_units
      FROM pg_class WHERE oid = 'mdata.units'::regclass;
    IF v_visible_units = 0 AND v_est_units > 0 THEN
      RAISE EXCEPTION 'ITEM-5a ABORTED — matched 0 demo rows and mdata.units reads 0 visible rows, but pg_class estimates ~% rows. The session is RLS-masked (FORCE RLS + no app.bypass_rls). Refusing to report a no-op as a successful purge.', v_est_units;
    END IF;
    RAISE NOTICE 'ITEM-5a: nothing to purge — % visible unit(s), no demo identifiers present. Continuing as a no-op.', v_visible_units;
  END IF;
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
  v_src_pk_col text;
  v_src_id_expr text;
  v_self_excl text;
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
    -- Resolve the SOURCE table's real identifying expression for offender reporting. Do NOT
    -- assume a column literally named "id" — many FK-source tables in this schema key on
    -- "uuid", on a composite PK, or (rarely) on no PK at all. Prefer the source table's actual
    -- single-column PK; fall back to ctid (always present) when there isn't one. This is
    -- diagnostic-only (offender identification), so ctid is a safe, always-valid fallback.
    v_src_pk_col := NULL;
    SELECT src_att2.attname
      INTO v_src_pk_col
      FROM pg_index idx
      JOIN pg_attribute src_att2
        ON src_att2.attrelid = idx.indrelid AND src_att2.attnum = idx.indkey[0]
     WHERE idx.indrelid = (quote_ident(r.src_schema) || '.' || quote_ident(r.src_table))::regclass
       AND idx.indisprimary
       AND array_length(idx.indkey, 1) = 1;

    IF v_src_pk_col IS NOT NULL THEN
      v_src_id_expr := format('s.%I::text', v_src_pk_col);
    ELSE
      v_src_id_expr := 's.ctid::text';
    END IF;

    -- Self-exclusion: a referencing row that is ITSELF one of the demo rows about to be purged
    -- is not an offender. This can only ever apply when the source table IS one of the four
    -- purge targets (a unit referencing a driver, a load referencing a unit, etc.) — and those
    -- four tables are verified (see file header) to always expose a single-column "id" PK. For
    -- every other source table this branch is structurally unreachable, so we omit the clause
    -- entirely rather than reference a literal "id" column that table may not have.
    IF (r.src_schema || '.' || r.src_table) IN
       ('mdata.units', 'mdata.drivers', 'mdata.loads', 'maintenance.work_orders') THEN
      v_self_excl := format(
        'AND NOT (%L = %L AND s.id::text IN (SELECT id::text FROM %I))',
        r.src_schema || '.' || r.src_table,
        r.src_schema || '.' || r.src_table,
        CASE r.src_schema || '.' || r.src_table
          WHEN 'mdata.units'             THEN '_demo_units'
          WHEN 'mdata.drivers'           THEN '_demo_drivers'
          WHEN 'mdata.loads'             THEN '_demo_loads'
          ELSE '_demo_wos'
        END
      );
    ELSE
      v_self_excl := '';
    END IF;

    -- The referencing row is an offender unless it is itself part of the demo set being removed.
    EXECUTE format($q$
      SELECT string_agg(DISTINCT x.id, ', ')
        FROM (
          SELECT %s AS id
            FROM %I.%I s
           WHERE s.%I::text IN (SELECT id::text FROM %s)
             %s
           LIMIT 25
        ) x $q$,
      v_src_id_expr,
      r.src_schema, r.src_table, r.src_column,
      CASE r.tgt_schema || '.' || r.tgt_table
        WHEN 'mdata.units'             THEN '_demo_units'
        WHEN 'mdata.drivers'           THEN '_demo_drivers'
        WHEN 'mdata.loads'             THEN '_demo_loads'
        ELSE '_demo_wos'
      END,
      v_self_excl
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
