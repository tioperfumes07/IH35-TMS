-- WONUM D1 (GO-1405, owner packet IH35-FINISH-2026-08-29/CC-1): maintenance.next_wo_display_id()
-- resolves the unit's display fragment via SELECT COALESCE(unit_number, id::text) INTO
-- v_unit_display_id -- if a unit is ever found with a NULL/blank unit_number, this silently bakes
-- a raw unit UUID into every new work-order display_id it mints (e.g. "WO-3f9a1c2e-...-IS-...").
-- mdata.units.unit_number is NOT NULL today (0 of 59 active units are null/blank, confirmed live),
-- so this branch is currently unreachable through the normal app-level unit-creation path -- but
-- the packet asks for it removed as defense-in-depth, not left as a landmine that only stays
-- unreachable as long as that constraint and every future write path both happen to agree. Refuses
-- creation outright instead: a new, distinct exception (E_UNIT_MISSING_UNIT_NUMBER) fires BEFORE
-- the existing E_UNIT_NOT_FOUND check would even run, since a unit missing its unit_number is a
-- different failure than a unit that does not exist for this company at all.
--
-- Rule 03 (do NOT renumber completed WOs): this migration only changes how FUTURE calls to
-- next_wo_display_id() resolve a unit fragment. It does not UPDATE any existing
-- maintenance.work_orders row, so no already-minted display_id (including any historical one that
-- may have baked in a UUID before this fix) is touched.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION maintenance.next_wo_display_id(p_unit_id uuid, p_source_type text, p_date date, p_op_co_id uuid)
 RETURNS TABLE(display_id text, sequence integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_unit_display_id text;
  v_seq int;
BEGIN
  IF p_source_type NOT IN ('IS','ES','AC','ET','RT','IT','RS') THEN
    RAISE EXCEPTION 'E_INVALID_WO_SOURCE_TYPE: %', p_source_type;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_unit_id::text));

  -- WOID-1: a unit's operating entity is COALESCE(currently_leased_to_company_id, owner_company_id),
  -- NOT a (non-existent) mdata.units.operating_company_id column.
  -- WONUM D1: no COALESCE(unit_number, id::text) fallback -- a unit with no real unit_number
  -- refuses WO creation instead of silently baking its raw UUID into the display_id.
  SELECT NULLIF(TRIM(unit_number), '')
  INTO v_unit_display_id
  FROM mdata.units
  WHERE id = p_unit_id
    AND COALESCE(currently_leased_to_company_id, owner_company_id) = p_op_co_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_UNIT_NOT_FOUND: %', p_unit_id;
  END IF;

  IF v_unit_display_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_MISSING_UNIT_NUMBER: unit % has no unit_number -- cannot generate a work order number', p_unit_id;
  END IF;

  SELECT COALESCE(MAX(unit_sequence), 0) + 1
  INTO v_seq
  FROM maintenance.work_orders
  WHERE unit_id = p_unit_id
    AND operating_company_id = p_op_co_id;

  display_id := CONCAT(
    'WO-',
    v_unit_display_id,
    '-',
    p_source_type,
    '-',
    TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'MM-DD-YYYY'),
    '-',
    LPAD(v_seq::text, 4, '0'),
    '-PEND0'
  );
  sequence := v_seq;
  RETURN NEXT;
END
$function$;
