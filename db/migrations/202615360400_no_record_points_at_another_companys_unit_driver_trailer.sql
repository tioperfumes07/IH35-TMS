-- 202615360400_no_record_points_at_another_companys_unit_driver_trailer.sql
-- CC-1 · ROUND 373.5 — OWNER RULING 2026-10-03: "we do not use another company's unit. Trucking and Transportation are
-- not operating anymore." A record may reference only ITS OWN company's driver, and only a unit or trailer/equipment
-- its company OWNS or CURRENTLY LEASES. Trucking owns the fleet and leases it to USMCA — the lease
-- (mdata.units / mdata.equipment .currently_leased_to_company_id) is the one correct cross-entity path. Refused in the
-- database, not validated in a screen. Companion to 369.1's frozen-company WRITE refusal (that stops writing INTO a
-- frozen company; this stops pointing AT another company's row).
--
-- Measured on production 2026-10-03 (direct, bypass), every single-column FK from a company-scoped table to
-- mdata.units / mdata.drivers / mdata.equipment (291 FKs, 1,586,597 USMCA references): 546 point at a row USMCA neither
-- owns nor leases — 508 of them telematics history (Samsara driver assignments, position snapshots), which record what
-- a truck reported and are deliberately out of scope here. On the documents this rule covers: 2 (loads 13481 / 13489,
-- both cancelled, unit T144 leased to TRANSPORTATION) — purge population, not touched.
--
-- Scope (the documents the owner named — fuel-card assignment, load, settlement, expense, bill, work order — plus their
-- lines and the driver-pay documents): 34 FK columns, declared below. Fires BEFORE INSERT, and BEFORE UPDATE only when
-- the referenced column itself changes, so an unrelated edit (a void, a status move) of a legacy row is never blocked.
-- SECURITY INVOKER on purpose: the caller's own RLS decides what it may see — a unit or driver invisible to the caller
-- is one its company has no right to reference, so the check fails closed. Idempotent.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION mdata.refuse_cross_company_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  col  text := TG_ARGV[0];
  kind text := TG_ARGV[1];
  ref  uuid;
  co   text;
  ok   boolean;
BEGIN
  ref := (to_jsonb(NEW) ->> col)::uuid;
  IF ref IS NULL OR NEW.operating_company_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> col) IS NOT DISTINCT FROM (to_jsonb(NEW) ->> col) THEN
    RETURN NEW;
  END IF;
  co := NEW.operating_company_id::text;
  IF kind = 'driver' THEN
    SELECT d.operating_company_id::text = co INTO ok FROM mdata.drivers d WHERE d.id = ref;
  ELSIF kind = 'unit' THEN
    SELECT (u.owner_company_id::text = co OR u.currently_leased_to_company_id::text = co) INTO ok FROM mdata.units u WHERE u.id = ref;
  ELSE
    SELECT (e.owner_company_id::text = co OR e.currently_leased_to_company_id::text = co) INTO ok FROM mdata.equipment e WHERE e.id = ref;
  END IF;
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%.% = % is another company''s % — a record references only its own company''s driver, or a unit/trailer its company owns or currently leases (ROUND 373.5)',
      TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, col, ref, kind
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION mdata.refuse_cross_company_reference() IS
  'ROUND 373.5: a record may reference only its own company''s driver, or a unit/equipment its company owns or currently leases.';

DO $$
DECLARE
  r record;
  tg text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('accounting', 'bill_lines',            'equipment_id',                           'equipment'),
    ('accounting', 'bill_lines',            'unit_id',                                'unit'),
    ('accounting', 'bills',                 'driver_id',                              'driver'),
    ('accounting', 'bills',                 'trailer_id',                             'equipment'),
    ('accounting', 'bills',                 'unit_id',                                'unit'),
    ('accounting', 'expense_lines',         'driver_id',                              'driver'),
    ('accounting', 'expense_lines',         'trailer_id',                             'equipment'),
    ('accounting', 'expense_lines',         'unit_id',                                'unit'),
    ('accounting', 'expenses',              'driver_uuid',                            'driver'),
    ('accounting', 'expenses',              'trailer_id',                             'equipment'),
    ('accounting', 'expenses',              'unit_id',                                'unit'),
    ('driver_finance', 'driver_advances',   'driver_id',                              'driver'),
    ('driver_finance', 'driver_advances',   'trailer_id',                             'equipment'),
    ('driver_finance', 'driver_advances',   'unit_id',                                'unit'),
    ('driver_finance', 'driver_bills',      'driver_id',                              'driver'),
    ('driver_finance', 'driver_bills',      'team_driver_id',                         'driver'),
    ('driver_finance', 'driver_reimbursements', 'driver_id',                          'driver'),
    ('driver_finance', 'driver_settlements', 'driver_id',                             'driver'),
    ('driver_finance', 'settlement_lines',  'disputed_by',                            'driver'),
    ('driver_finance', 'settlement_lines',  'split_partner_driver_id',                'driver'),
    ('fuel', 'fuel_card_assignments',       'driver_id',                              'driver'),
    ('fuel', 'fuel_card_assignments',       'unit_id',                                'unit'),
    ('fuel', 'fuel_transactions',           'driver_id',                              'driver'),
    ('fuel', 'fuel_transactions',           'trailer_id',                             'equipment'),
    ('fuel', 'fuel_transactions',           'unit_id',                                'unit'),
    ('maintenance', 'work_orders',          'driver_id',                              'driver'),
    ('maintenance', 'work_orders',          'equipment_id',                           'equipment'),
    ('maintenance', 'work_orders',          'unit_id',                                'unit'),
    ('mdata', 'loads',                      'accepted_by_driver_id',                  'driver'),
    ('mdata', 'loads',                      'assigned_primary_driver_id',             'driver'),
    ('mdata', 'loads',                      'assigned_secondary_driver_id',           'driver'),
    ('mdata', 'loads',                      'assigned_unit_id',                       'unit'),
    ('mdata', 'loads',                      'team_split_override_primary_driver_id',  'driver'),
    ('mdata', 'loads',                      'team_split_override_secondary_driver_id','driver')
  ) AS v(sch, tbl, col, kind)
  LOOP
    IF to_regclass(format('%I.%I', r.sch, r.tbl)) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = r.sch AND c.table_name = r.tbl AND c.column_name = r.col) THEN
      CONTINUE;  -- a fresh database that does not carry the column yet: nothing to guard
    END IF;
    tg := left(format('trg_xco_%s', r.col), 63);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', tg, r.sch, r.tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I.%I FOR EACH ROW EXECUTE FUNCTION mdata.refuse_cross_company_reference(%L, %L)',
                   tg, r.col, r.sch, r.tbl, r.col, r.kind);
  END LOOP;
END $$;

COMMIT;
