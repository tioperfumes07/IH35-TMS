-- 202615340600_fuel_relay_worm_audit_force_rls.sql
-- CC-2 engine, ROUND 352 nine-point / standing-order ten-point, measured 2026-10-03 on CC-2's fuel + Relay tables:
--   * fuel.fuel_transactions (the fuel cost source), integrations.relay_fuel_transactions (Relay's own record of each
--     fill), its lines and integrations.relay_deposits had NO delete refusal (point: WORM) and NO row audit;
--   * fuel.fraud_alerts had no row audit;
--   * fuel.load_fuel_cost / tank_events / tank_state / unit_mpg had RLS enabled with policies but not FORCED, so the
--     table owner reads across companies.
-- No code path deletes from these tables (measured: 0 literal DELETEs in apps/backend/src, scripts, db/migrations; the
-- positive control finds 17 on accounting.transaction_source_links). The governed purge removes VOIDED fuel rows under
-- an owner AUTH (AUTH-177's list) — the refusal below keeps exactly that door and closes every other one.
--   fuel.refuse_source_row_delete(): a DELETE needs app.purge_auth_id = AUTH-<n> AND a row the purge may take —
--     listed for that AUTH in _system.purge_authorized_rows, or voided, or (a Relay line) whose fill is voided or
--     already removed (the ON DELETE CASCADE from its fill). Everything else is refused for every role.
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS / guarded CREATE TRIGGER; FORCE is a no-op when set.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

CREATE OR REPLACE FUNCTION fuel.refuse_source_row_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_row jsonb := to_jsonb(OLD);
BEGIN
  IF v_auth ~ '^AUTH-[0-9]+$' THEN
    IF to_regclass('_system.purge_authorized_rows') IS NOT NULL AND EXISTS (
         SELECT 1 FROM _system.purge_authorized_rows r
          WHERE r.auth_id = v_auth AND r.table_name = v_table AND r.row_pk = v_row ->> 'id') THEN
      RETURN OLD;
    END IF;
    IF (v_row ->> 'voided_at') IS NOT NULL THEN
      RETURN OLD;
    END IF;
    IF v_table = 'integrations.relay_fuel_transaction_lines'
       AND NOT EXISTS (SELECT 1 FROM integrations.relay_fuel_transactions t
                        WHERE t.id = (v_row ->> 'relay_fuel_transaction_id')::uuid AND t.voided_at IS NULL) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION '% is WORM: row % cannot be deleted — void it instead, or purge it under an open owner AUTH once voided',
    v_table, COALESCE(v_row ->> 'id', '?') USING ERRCODE = 'restrict_violation';
END
$fn$;

DO $$
DECLARE
  t text;
  worm text[] := ARRAY['fuel.fuel_transactions', 'integrations.relay_fuel_transactions',
                       'integrations.relay_fuel_transaction_lines', 'integrations.relay_deposits'];
  audited text[] := ARRAY['fuel.fuel_transactions', 'integrations.relay_fuel_transactions',
                          'integrations.relay_fuel_transaction_lines', 'integrations.relay_deposits', 'fuel.fraud_alerts'];
  forced text[] := ARRAY['fuel.load_fuel_cost', 'fuel.tank_events', 'fuel.tank_state', 'fuel.unit_mpg'];
BEGIN
  FOREACH t IN ARRAY worm LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format('CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION fuel.refuse_source_row_delete()', t);
  END LOOP;
  IF to_regproc('audit.tg_audit_row') IS NOT NULL THEN
    FOREACH t IN ARRAY audited LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = t::regclass AND NOT tgisinternal
                        AND tgfoid = 'audit.tg_audit_row'::regproc) THEN
        EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
                       replace(t, '.', '_'), t);
      END IF;
    END LOOP;
  END IF;
  FOREACH t IN ARRAY forced LOOP
    -- Only force where policies exist: forcing RLS on a policy-less table would lock out every reader.
    IF (SELECT count(*) FROM pg_policy WHERE polrelid = t::regclass) = 0 THEN
      RAISE EXCEPTION '202615340600: % has no RLS policy — refusing to FORCE it', t;
    END IF;
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Post-conditions.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO v_missing FROM unnest(ARRAY['fuel.fuel_transactions', 'integrations.relay_fuel_transactions',
         'integrations.relay_fuel_transaction_lines', 'integrations.relay_deposits']) x
   WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = x::regclass AND tgname = 'trg_worm_refuse_delete' AND tgenabled <> 'D');
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION '202615340600: WORM missing on %', v_missing; END IF;
  SELECT string_agg(x, ', ') INTO v_missing FROM unnest(ARRAY['fuel.load_fuel_cost', 'fuel.tank_events', 'fuel.tank_state', 'fuel.unit_mpg']) x
   WHERE NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = x::regclass);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION '202615340600: FORCE RLS missing on %', v_missing; END IF;
END $$;

COMMIT;
