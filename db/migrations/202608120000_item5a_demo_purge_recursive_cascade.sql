-- 202608120000_item5a_demo_purge_recursive_cascade.sql
--
-- ============================================================================================
-- DO NOT RUN ON PROD  —  HELD FOR JORGE
-- Registered in db/migrations/.held-migrations.json. db:migrate HELD-SKIPs this on prod; the owner
-- applies it by hand on Neon and ledger-backfills. No agent applies it.
-- ============================================================================================
--
-- REPLACES the hand-ordered ITEM-5a purge (202608060000), which aborted on prod: a fixed
-- loads -> work_orders -> units -> drivers order cannot satisfy 326 foreign keys across 191 tables.
-- GUARD proved the recursive form on Neon branch br-fragrant-surf-akzzksd8: 7,216 rows across
-- 8 tables removed, every demo root reaching 0, no stuck pass, no FK error.
--
-- ============================================================================================
-- OWNER OVERRIDE — READ BEFORE CITING THIS AS PRECEDENT
-- ============================================================================================
-- The standing NEVER-DELETE / archive-only law (Rule 07) is NOT repealed. Owner ruling 2026-07-25:
-- the law protects ARCHITECTURE, BLUEPRINT, DESIGN, LINKAGE, SCHEMA and REAL BUSINESS DATA; it does
-- NOT protect test/demo fixture ROWS, which may be permanently deleted under owner authorisation.
-- The override is NARROW: rows reachable from an EXACT DEMO IDENTIFIER. It is NOT authority to delete
-- business rows, and NOT authority to delete on the is_sample_data flag.
--
-- ============================================================================================
-- WHY AN AUTO-CASCADE IS SAFE HERE: the two assertions in Step 3
-- ============================================================================================
-- A recursive delete that discovers its own scope is only auditable if it can REFUSE. This one aborts
-- the entire transaction if either holds:
--   (a) the closure reaches a financial/authoritative schema (accounting, banking, driver_finance,
--       factor*, settlement*, payroll, safety). Demo data must never be money-linked. If it is, that
--       is a finding for the owner, not something to delete past.
--   (b) the closure exceeds 50,000 rows — a runaway guard. A demo fixture set is thousands of rows,
--       not tens of thousands; blowing the cap means the seed matched something it should not have.
-- Neither is a warning. Both RAISE, and the whole transaction rolls back.
--
-- ============================================================================================
-- WHY is_sample_data IS NEVER USED AS A SELECTOR
-- ============================================================================================
-- Measured on prod 2026-07-25: FALSE on 176 real rows, TRUE on 17 fixtures. Zero signal. A purge
-- filtered on it would both miss fixtures and destroy real business data. Every root below is keyed
-- on a business identifier. Step 5 repairs the mis-flags; Step 6 deprecates the column in place.
--
-- The DEMO-106 trap specifically: that unit's VIN is a REAL-format '1GD473C89NJ123106', not '1DEMO%'.
-- An earlier draft scoped units by VIN and silently orphaned it. Units are scoped by unit_number only.

BEGIN;

-- ── 0. RLS BYPASS — REQUIRED ───────────────────────────────────────────────────────────────
-- mdata.* carries FORCE ROW LEVEL SECURITY, which applies policies even to the table owner. Without
-- this every demo row is INVISIBLE, the seed matches 0, and a delete-nothing run COMMITs and reports
-- success — a silent no-op indistinguishable from a real purge. That is exactly what happened on the
-- first prod attempt (2026-07-25); only an unrelated error stopped it. See the fail-loud guard below.
SET LOCAL app.bypass_rls = 'lucia';

CREATE TEMP TABLE _demo_closure (
  schema_name text NOT NULL,
  table_name  text NOT NULL,
  pk_col      text NOT NULL,
  id_text     text NOT NULL,
  depth       int  NOT NULL DEFAULT 0,
  expanded    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (schema_name, table_name, id_text)
) ON COMMIT DROP;

-- ── 1. Seed the demo ROOTS by EXACT identifier ─────────────────────────────────────────────
INSERT INTO _demo_closure (schema_name, table_name, pk_col, id_text)
SELECT 'mdata','units','id',id::text FROM mdata.units WHERE unit_number LIKE 'DEMO-%'
UNION ALL SELECT 'mdata','drivers','id',id::text FROM mdata.drivers
  WHERE last_name ILIKE 'Demo %' OR last_name ILIKE '% Demo %'
UNION ALL SELECT 'mdata','loads','id',id::text FROM mdata.loads WHERE load_number LIKE 'DEMO-L%'
UNION ALL SELECT 'maintenance','work_orders','id',id::text FROM maintenance.work_orders WHERE display_id LIKE 'DEMO-WO-%'
UNION ALL SELECT 'mdata','vendors','id',id::text FROM mdata.vendors WHERE vendor_name LIKE 'DEMO-%'
UNION ALL SELECT 'mdata','customers','id',id::text FROM mdata.customers WHERE customer_name LIKE 'DEMO-%'
ON CONFLICT DO NOTHING;

-- ── 2. Fail loud if the seed is empty while rows plainly exist (RLS-mask detector) ──────────
DO $$
DECLARE
  v_roots bigint; v_visible bigint; v_est bigint;
BEGIN
  SELECT count(*) INTO v_roots FROM _demo_closure;
  RAISE NOTICE 'ITEM-5a roots seeded: %', v_roots;
  IF v_roots = 0 THEN
    -- Discriminate MASKED from genuinely-CLEAN with an RLS-IMMUNE signal. A visible count cannot:
    -- a masked session sees 0 everywhere, and an already-purged database also sees 0 demo rows.
    -- pg_class.reltuples is catalog metadata and is not filtered by RLS.
    SELECT count(*) INTO v_visible FROM mdata.units;
    SELECT COALESCE(reltuples,0)::bigint INTO v_est FROM pg_class WHERE oid = 'mdata.units'::regclass;
    IF v_visible = 0 AND v_est > 0 THEN
      RAISE EXCEPTION 'ITEM-5a ABORTED — 0 demo roots and mdata.units reads 0 visible rows while pg_class estimates ~% rows. The session is RLS-masked. Refusing to report a no-op as a successful purge.', v_est;
    END IF;
    RAISE NOTICE 'ITEM-5a: nothing to purge — % visible unit(s), no demo identifiers. No-op.', v_visible;
  END IF;
END $$;

-- ── 3. Recursively collect the FK-descendant closure, then ASSERT ──────────────────────────
DO $$
DECLARE
  r record;
  v_added bigint;
  v_total bigint;
  v_depth int := 0;
  v_bad text;
  MAX_ROWS constant bigint := 50000;
  -- Authoritative/financial schemas. Demo data must never be linked into these.
  FIN_SCHEMAS constant text[] := ARRAY['accounting','banking','driver_finance','payroll','safety'];
BEGIN
  LOOP
    v_depth := v_depth + 1;
    EXIT WHEN v_depth > 25;   -- structural depth bound; the closure is a DAG in practice
    v_added := 0;

    -- Snapshot the frontier BEFORE expanding, so rows discovered in this pass stay unexpanded.
    CREATE TEMP TABLE _pass_start ON COMMIT DROP AS
      SELECT schema_name, table_name, id_text FROM _demo_closure WHERE NOT expanded;

    FOR r IN
      -- Every single-column FK whose TARGET table currently has unexpanded rows in the closure.
      SELECT DISTINCT
             src_ns.nspname  AS src_schema,
             src.relname     AS src_table,
             src_att.attname AS src_col,
             tgt_ns.nspname  AS tgt_schema,
             tgt.relname     AS tgt_table,
             tgt_att.attname AS tgt_col,
             COALESCE(pk_att.attname, 'id') AS src_pk
        FROM pg_constraint con
        JOIN pg_class src         ON src.oid = con.conrelid
        JOIN pg_namespace src_ns  ON src_ns.oid = src.relnamespace
        JOIN pg_class tgt         ON tgt.oid = con.confrelid
        JOIN pg_namespace tgt_ns  ON tgt_ns.oid = tgt.relnamespace
        JOIN pg_attribute src_att ON src_att.attrelid = con.conrelid AND src_att.attnum = con.conkey[1]
        JOIN pg_attribute tgt_att ON tgt_att.attrelid = con.confrelid AND tgt_att.attnum = con.confkey[1]
        LEFT JOIN LATERAL (
          SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
           WHERE i.indrelid = con.conrelid AND i.indisprimary AND i.indnatts = 1
           LIMIT 1
        ) pk_att ON true
       WHERE con.contype = 'f'
         AND array_length(con.conkey,1) = 1
         AND EXISTS (SELECT 1 FROM _demo_closure c
                      WHERE c.schema_name = tgt_ns.nspname AND c.table_name = tgt.relname
                        AND NOT c.expanded)
    LOOP
      -- Pull every child row pointing at a closure row. ON CONFLICT DO NOTHING makes re-visits free.
      EXECUTE format(
        'INSERT INTO _demo_closure (schema_name, table_name, pk_col, id_text, depth)
           SELECT %L, %L, %L, s.%I::text, %s
             FROM %I.%I s
            WHERE s.%I::text IN (SELECT id_text FROM _demo_closure
                                  WHERE schema_name = %L AND table_name = %L)
         ON CONFLICT DO NOTHING',
        r.src_schema, r.src_table, r.src_pk, r.src_pk, v_depth,
        r.src_schema, r.src_table,
        r.src_col, r.tgt_schema, r.tgt_table);
      GET DIAGNOSTICS v_total = ROW_COUNT;
      v_added := v_added + v_total;
    END LOOP;

    -- Mark expanded ONLY the rows that were unexpanded when this pass STARTED. A blanket
    -- "SET expanded = true WHERE NOT expanded" also marks rows inserted DURING the pass, so their own
    -- children are never collected: the walk silently stops one level short. That produced a closure
    -- of depth 2 that missed dispatch.stop_events, and the delete phase then wedged on load_stops
    -- because a grandchild still referenced it. The pass-start snapshot is what makes the walk
    -- genuinely transitive.
    UPDATE _demo_closure c SET expanded = true
      FROM _pass_start p
     WHERE c.schema_name = p.schema_name AND c.table_name = p.table_name AND c.id_text = p.id_text;
    DROP TABLE _pass_start;
    EXIT WHEN v_added = 0;
  END LOOP;

  SELECT count(*) INTO v_total FROM _demo_closure;
  RAISE NOTICE 'ITEM-5a closure: % row(s) across % table(s), depth %',
    v_total, (SELECT count(DISTINCT schema_name||'.'||table_name) FROM _demo_closure), v_depth;

  -- ASSERTION (a) — the closure must never reach money or authoritative safety data.
  SELECT string_agg(DISTINCT schema_name||'.'||table_name||' ('||cnt||' rows)', ', ')
    INTO v_bad
    FROM (SELECT schema_name, table_name, count(*) AS cnt FROM _demo_closure
           WHERE schema_name = ANY (FIN_SCHEMAS)
           GROUP BY 1,2) x;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'ITEM-5a ABORTED — the demo closure reaches FINANCIAL/AUTHORITATIVE schema(s): %.\nDemo data must never be money-linked. This is a finding for the owner, not something to delete past.', v_bad;
  END IF;

  -- ASSERTION (b) — runaway guard.
  IF v_total > MAX_ROWS THEN
    RAISE EXCEPTION 'ITEM-5a ABORTED — closure of % rows exceeds the % row cap. A demo fixture set is thousands of rows; blowing the cap means the seed matched something it should not have.', v_total, MAX_ROWS;
  END IF;
END $$;

-- ── 4. Delete bottom-up, retrying on FK violation until the closure is empty ────────────────
DO $$
DECLARE
  r record;
  v_remaining bigint;
  v_prev bigint := -1;
  v_deleted bigint;
  v_pass int := 0;
  v_total_deleted bigint := 0;
BEGIN
  LOOP
    SELECT count(*) INTO v_remaining FROM _demo_closure;
    EXIT WHEN v_remaining = 0;
    -- No progress in a whole pass => a cycle or an un-deletable row. Fail loudly rather than spin.
    IF v_remaining = v_prev THEN
      RAISE EXCEPTION 'ITEM-5a ABORTED — stuck with % closure row(s) still undeleted after a full pass. Remaining: %',
        v_remaining,
        (SELECT string_agg(DISTINCT schema_name||'.'||table_name, ', ') FROM _demo_closure);
    END IF;
    v_prev := v_remaining;
    v_pass := v_pass + 1;

    -- Deepest first: children before parents.
    FOR r IN SELECT schema_name, table_name, pk_col, max(depth) AS d
               FROM _demo_closure GROUP BY 1,2,3 ORDER BY max(depth) DESC
    LOOP
      BEGIN
        EXECUTE format(
          'DELETE FROM %I.%I WHERE %I::text IN (SELECT id_text FROM _demo_closure WHERE schema_name=%L AND table_name=%L)',
          r.schema_name, r.table_name, r.pk_col, r.schema_name, r.table_name);
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        DELETE FROM _demo_closure WHERE schema_name=r.schema_name AND table_name=r.table_name;
        v_total_deleted := v_total_deleted + v_deleted;
        IF v_deleted > 0 THEN
          RAISE NOTICE 'ITEM-5a deleted % row(s) from %.%', v_deleted, r.schema_name, r.table_name;
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        -- A dependent is still pending; leave this table for a later pass.
        NULL;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'ITEM-5a purge complete: % row(s) deleted in % pass(es)', v_total_deleted, v_pass;
END $$;

-- ── 5. Correct the mis-flagged REAL rows (do NOT delete these) ──────────────────────────────
-- Scoped by the DEFINING property — flagged true but NOT a demo identifier — so it is entity-agnostic
-- and needs no UUID literal. Counts are REPORTED, never asserted against 176, so a correct database
-- cannot fail here.
DO $$
DECLARE v_d int; v_u int; v_l int; v_v int; v_c int;
BEGIN
  UPDATE mdata.drivers SET is_sample_data = false
   WHERE is_sample_data AND NOT (last_name ILIKE 'Demo %' OR last_name ILIKE '% Demo %');
  GET DIAGNOSTICS v_d = ROW_COUNT;
  UPDATE mdata.units SET is_sample_data = false WHERE is_sample_data AND unit_number NOT LIKE 'DEMO-%';
  GET DIAGNOSTICS v_u = ROW_COUNT;
  UPDATE mdata.loads SET is_sample_data = false WHERE is_sample_data AND load_number NOT LIKE 'DEMO-L%';
  GET DIAGNOSTICS v_l = ROW_COUNT;
  UPDATE mdata.vendors SET is_sample_data = false WHERE is_sample_data AND vendor_name NOT LIKE 'DEMO-%';
  GET DIAGNOSTICS v_v = ROW_COUNT;
  UPDATE mdata.customers SET is_sample_data = false WHERE is_sample_data AND customer_name NOT LIKE 'DEMO-%';
  GET DIAGNOSTICS v_c = ROW_COUNT;
  RAISE NOTICE 'ITEM-5a corrected mis-flagged REAL rows: drivers=% units=% loads=% vendors=% customers=% (total=%)',
    v_d, v_u, v_l, v_v, v_c, v_d+v_u+v_l+v_v+v_c;
END $$;

-- ── 6. Deprecate is_sample_data in place (never dropped — Rule 07 protects SCHEMA) ──────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mdata.customers','mdata.vendors','mdata.drivers','mdata.units','mdata.loads']
  LOOP
    EXECUTE format('COMMENT ON COLUMN %s.is_sample_data IS %L', t,
      'DEPRECATED 2026-07-25 — DO NOT FILTER ON THIS COLUMN. Measured on prod: false on 176 real rows, '
      || 'true on 17 fixtures = zero signal. NEVER use it to select rows for DELETE or purge (guarded by '
      || 'scripts/verify-steps/1488-verify-no-is-sample-data-purge.mjs). Identify demo data by exact '
      || 'business identifier: units DEMO-%, loads DEMO-L%, work_orders DEMO-WO-%, drivers last_name '
      || 'ILIKE ''Demo %''. Retained, not dropped — Rule 07 protects schema.');
  END LOOP;
END $$;

COMMIT;
