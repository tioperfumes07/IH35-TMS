-- WONUM D2/D3 (owner packet GO-WONUM-01-RULE03-2026-08-29.md, GO-1405) -- two gaps found live while
-- checking the inbox after shipping WONUM D1 (202613290800):
--
-- 1. maintenance.refresh_wo_display_id() has the SAME COALESCE(unit_number, id::text) UUID-fallback
--    bug next_wo_display_id had before D1 -- D1 only fixed ONE of the two functions that mint a WO
--    display_id. refresh_wo_display_id runs immediately after every create (per work-orders.routes.ts's
--    own LV-WO-DISPLAY-ID-V5-IS-HARDCODED-PEND0 comment) to stamp the real V5 suffix, so this second
--    unfixed copy of the bug was just as live a landmine as the first one D1 closed.
--
-- 2. D2 -- "V5 must not change after a non-PEND0 value" (owner-locked: lock-on-first-non-PEND0,
--    general authorization 2026-08-29, not branch-(a)-by-name). refresh_wo_display_id currently
--    recomputes and overwrites v5_suffix/display_id UNCONDITIONALLY on every call while status is not
--    complete/completed -- there is no lock at all. If an invoice number were corrected after the WO's
--    real V5 was already stamped once, a second refresh call would silently change the display_id
--    again, contradicting Rule 03's own "recompute when invoice number changed" self-contradiction
--    D2 exists specifically to remove.
--
-- Also renaming next_wo_display_id's D1 exception to the LOCKED code
-- .cursor/rules/03-display-ids.mdc:25 actually specifies (E_UNIT_HAS_NO_NUMBER) -- confirmed via
-- git grep after D1 shipped; D1 used E_UNIT_MISSING_UNIT_NUMBER, not knowing the locked rule
-- existed. Same distinct-exception-vs-E_UNIT_NOT_FOUND structure, just the locked name.
--
-- D3 (Rule 03 {UNIT} -> mdata.units.unit_number, not master_data.units.display_id): confirmed via
-- `git grep master_data .cursor/rules/` this session -- .cursor/rules/03-display-ids.mdc:25 already
-- correctly reads "mdata.units.unit_number... Never master_data. Never UUID fallback." The only
-- other 2 hits (00-always-read-first.mdc:88, 04-locked-invariants.mdc:19) are an unrelated
-- driver-render-cache rule ("Cache from master_data.drivers NEVER used in render path"), not a WO
-- display-id concern. No doc change needed for D3; reported, not fixed (nothing to fix).
--
-- Idempotent: CREATE OR REPLACE FUNCTION x2.

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
    RAISE EXCEPTION 'E_UNIT_HAS_NO_NUMBER: unit % has no unit_number -- cannot generate a work order number', p_unit_id;
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

CREATE OR REPLACE FUNCTION maintenance.refresh_wo_display_id(p_wo_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_wo RECORD;
  v_unit_display_id text;
  v_v5 text;
  v_new_id text;
BEGIN
  SELECT *
  INTO v_wo
  FROM maintenance.work_orders
  WHERE id = p_wo_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_WO_NOT_FOUND: %', p_wo_id;
  END IF;

  IF v_wo.status IN ('complete', 'completed') THEN
    RAISE EXCEPTION 'E_WO_DISPLAY_ID_LOCKED';
  END IF;

  -- D2: V5 locks on the first non-PEND0 value it is ever given. A later refresh call (e.g. after an
  -- invoice-number correction) must NOT silently re-mint the display_id a second time.
  IF v_wo.v5_suffix IS NOT NULL AND v_wo.v5_suffix <> 'PEND0' THEN
    RETURN v_wo.display_id;
  END IF;

  SELECT NULLIF(TRIM(unit_number), '')
  INTO v_unit_display_id
  FROM mdata.units
  WHERE id = v_wo.unit_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_UNIT_NOT_FOUND: %', v_wo.unit_id;
  END IF;

  IF v_unit_display_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_HAS_NO_NUMBER: unit % has no unit_number -- cannot generate a work order number', v_wo.unit_id;
  END IF;

  v_v5 := maintenance.compute_v5_suffix(p_wo_id);
  v_new_id := CONCAT(
    'WO-',
    v_unit_display_id,
    '-',
    v_wo.source_type,
    '-',
    TO_CHAR(COALESCE(v_wo.opened_at, v_wo.created_at, now())::date, 'MM-DD-YYYY'),
    '-',
    LPAD(v_wo.unit_sequence::text, 4, '0'),
    '-',
    v_v5
  );

  UPDATE maintenance.work_orders
  SET display_id = v_new_id, v5_suffix = v_v5, updated_at = now()
  WHERE id = p_wo_id;

  RETURN v_new_id;
END
$function$;
