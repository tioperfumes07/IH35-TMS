-- ENG-54 UNIT OWNERSHIP ENGINE (ROUND 8.20, owner rule: "Every real truck is owned by IH 35 Trucking and leased to USMCA").
--
-- ROOT CAUSE (measured 2026-11-12 23:50Z, audit.row_changes): a batch write at 2026-09-01 05:16:24Z flipped
-- owner_company_id on T122 / T124 / T156 from IH 35 Trucking LLC (company_type asset_holder) to IH 35 Transportation
-- LLC (operating_carrier) while each stayed leased to USMCA. Nothing refused it: mdata.units has ~20 writers (unit
-- profile PATCH, maintenance vehicles, Samsara sync, bulk update, CSV import, lease engine, workflows) and none of
-- them checks who may own a leased unit.
--
-- ENGINE: one rule at the single place every writer passes through — the row itself.
--   A unit leased to an operating carrier must be owned by an asset holder.
-- Enforced BEFORE INSERT, and BEFORE UPDATE only when owner_company_id or currently_leased_to_company_id changes, so
-- unrelated writes (odometer, status, Samsara sync) to a unit already in breach keep working until the owner corrects
-- it through Fleet > unit > Edit > Identity > Owner Company. The correcting write passes the rule.
--
-- No money, no GL. Reverse: DROP TRIGGER trg_units_lease_owner_asset_holder ON mdata.units (nothing else depends on it).
-- Fresh-DB safe: creates a function and a trigger only; reads no production rows.
BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION mdata.tg_units_lease_owner_asset_holder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mdata, org, pg_catalog
AS $$
DECLARE
  v_prev_bypass text := current_setting('app.bypass_rls', true);
  v_lessee_type text;
  v_owner_type  text;
BEGIN
  IF NEW.currently_leased_to_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- org.companies is FORCE RLS; read both company types under bypass, then restore the caller's setting exactly.
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  SELECT c.company_type::text INTO v_lessee_type FROM org.companies c WHERE c.id = NEW.currently_leased_to_company_id;
  SELECT c.company_type::text INTO v_owner_type  FROM org.companies c WHERE c.id = NEW.owner_company_id;
  PERFORM set_config('app.bypass_rls', COALESCE(v_prev_bypass, ''), true);

  IF v_lessee_type = 'operating_carrier' AND v_owner_type IS DISTINCT FROM 'asset_holder' THEN
    RAISE EXCEPTION 'unit_owner_must_be_asset_holder'
      USING ERRCODE = 'P0001',
            DETAIL = format('unit %s (%s) is leased to operating carrier %s but owner %s is %s, not an asset holder',
                            NEW.unit_number, NEW.id, NEW.currently_leased_to_company_id, NEW.owner_company_id,
                            COALESCE(v_owner_type, 'unknown')),
            HINT = 'A leased truck is owned by the asset holder (IH 35 Trucking LLC). Set Owner Company to the asset holder.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_units_lease_owner_asset_holder ON mdata.units;

CREATE TRIGGER trg_units_lease_owner_asset_holder
  BEFORE INSERT ON mdata.units
  FOR EACH ROW
  EXECUTE FUNCTION mdata.tg_units_lease_owner_asset_holder();

DROP TRIGGER IF EXISTS trg_units_lease_owner_asset_holder_upd ON mdata.units;

CREATE TRIGGER trg_units_lease_owner_asset_holder_upd
  BEFORE UPDATE ON mdata.units
  FOR EACH ROW
  WHEN (OLD.owner_company_id IS DISTINCT FROM NEW.owner_company_id
        OR OLD.currently_leased_to_company_id IS DISTINCT FROM NEW.currently_leased_to_company_id)
  EXECUTE FUNCTION mdata.tg_units_lease_owner_asset_holder();

COMMIT;
