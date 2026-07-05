-- WOID-1: maintenance.next_wo_display_id read a PHANTOM column mdata.units.operating_company_id.
--
-- mdata.units has NO operating_company_id column (§4 landmine). A unit's operating entity is
--   COALESCE(currently_leased_to_company_id, owner_company_id)
-- (owner_company_id = TRK owns; currently_leased_to_company_id = TRANSP/USMCA lease) — the same
-- resolution already used by migration 0176 and the WO list/views. The original body (migration 0049)
-- scoped the unit lookup by a bare units.operating_company_id predicate, which throws Postgres 42703
-- (undefined_column) at runtime → a 500 on every Work-Order create through maintenance/work-orders.routes.ts
-- (the maintenance.next_wo_display_id path), and would silently mis-scope the unit lookup even if the
-- column existed.
--
-- This CREATE OR REPLACE re-defines the function with the correct unit→company resolution. It is
-- idempotent, adds/alters NO columns, and changes only the unit WHERE clause. The sibling
-- maintenance.refresh_wo_display_id was already correct (it never filtered units by company).

CREATE OR REPLACE FUNCTION maintenance.next_wo_display_id(
  p_unit_id uuid,
  p_source_type text,
  p_date date,
  p_op_co_id uuid
) RETURNS TABLE(display_id text, sequence int)
LANGUAGE plpgsql
AS $$
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
  SELECT COALESCE(unit_number, id::text)
  INTO v_unit_display_id
  FROM mdata.units
  WHERE id = p_unit_id
    AND COALESCE(currently_leased_to_company_id, owner_company_id) = p_op_co_id
  LIMIT 1;

  IF v_unit_display_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_NOT_FOUND: %', p_unit_id;
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
$$;
