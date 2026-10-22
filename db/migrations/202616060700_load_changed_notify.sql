-- 202616060700_load_changed_notify.sql  (CC-2, claimed on main first — LEAD 443.208R)
-- OWNER (16:10 CT 10-21): "if we change status in one view it updates in all views. if data is updated in one location it
-- is automatically and instantly updated in all locations."
--
-- ONE change signal for every writer: an AFTER INSERT / UPDATE / DELETE row trigger on every table a load view reads
-- calls mdata.notify_load_changed(), which pg_notify('load_changed', {company_id, load_ids, table, op}). Postgres delivers
-- a NOTIFY only when the transaction COMMITS (a rolled-back write never signals) and folds identical payloads of one
-- transaction into one. No route edits: every writer (routes, crons, engines, trg_invoice_death_reverts_load) is covered.
-- The backend's load-change bus (apps/backend/src/realtime/load-change-bus.ts) LISTENs and pushes `load.changed` to every
-- open browser of that company over the existing notifications SSE stream.
--
-- Trigger argument = the column holding the load id ('id' on mdata.loads; 'settlement' = the header's lines' loads).
-- Rows with no load id are silent. The payload stays far below the 8000-byte NOTIFY limit (load_ids capped at 50).
--
-- IDEMPOTENT + FRESH-DB SAFE: CREATE OR REPLACE; DROP TRIGGER IF EXISTS + CREATE; a table that does not exist is skipped.

BEGIN;

-- a trigger DDL waits for a lock on busy tables; fail fast instead of stalling live reads (the deploy retries).
SET LOCAL lock_timeout = '5s';

SET LOCAL search_path TO pg_catalog, public;

CREATE OR REPLACE FUNCTION mdata.notify_load_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  src jsonb;
  col text := TG_ARGV[0];
  company text;
  ids text[];
BEGIN
  src := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  company := src->>'operating_company_id';
  IF col = 'settlement' THEN
    SELECT array_agg(DISTINCT sl.load_id::text) INTO ids
      FROM (SELECT load_id FROM driver_finance.settlement_lines
             WHERE settlement_id = (src->>'id')::uuid AND load_id IS NOT NULL LIMIT 50) sl;
  ELSE
    ids := ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[
      src->>col,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD)->>col END
    ]) AS x WHERE x IS NOT NULL);
  END IF;
  IF ids IS NULL OR cardinality(ids) = 0 THEN
    RETURN NULL;
  END IF;
  PERFORM pg_notify('load_changed', json_build_object(
    'company_id', company,
    'load_ids', ids,
    'table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    'op', TG_OP
  )::text);
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION mdata.notify_load_changed() IS
  'LEAD 443.208R: the one load-change signal. pg_notify(load_changed, {company_id, load_ids, table, op}) at COMMIT for every write to a table a load view reads. Listened to by apps/backend/src/realtime/load-change-bus.ts.';

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('mdata', 'loads', 'id'),
      ('mdata', 'load_stops', 'load_id'),
      ('driver_finance', 'driver_settlements', 'settlement'),
      ('driver_finance', 'settlement_lines', 'load_id'),
      ('driver_finance', 'driver_bills', 'load_id'),
      ('accounting', 'invoices', 'source_load_id'),
      ('dispatch', 'load_cancellations', 'load_id'),
      ('accounting', 'expenses', 'load_id'),
      ('accounting', 'bills', 'load_id'),
      ('accounting', 'bill_lines', 'load_id'),
      ('fuel', 'fuel_transactions', 'load_id')
    ) AS v(sch, tbl, col)
  LOOP
    IF to_regclass(format('%I.%I', t.sch, t.tbl)) IS NULL THEN
      RAISE NOTICE 'load_changed notify: %.% absent — skipped', t.sch, t.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_load_changed ON %I.%I', t.sch, t.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_notify_load_changed AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
      'FOR EACH ROW EXECUTE FUNCTION mdata.notify_load_changed(%L)', t.sch, t.tbl, t.col);
  END LOOP;
END $$;

COMMIT;
