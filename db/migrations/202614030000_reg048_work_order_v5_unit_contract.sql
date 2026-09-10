-- REG-048 — maintenance work-order V5 finalization + active-unit invariant.
--
-- Canonical semantics:
--   * V5 is derived from the first persisted vendor reference: the work-order invoice number,
--     vendor WO number, or oldest non-voided parts invoice. Labor-only work uses LABOR.
--   * refresh_wo_display_id locks forever after the first non-PEND0 value.
--   * an active work order must have a unit. The NOT VALID constraint immediately rejects new
--     invalid writes while allowing the two authorized legacy rows to be voided through the
--     audited HTTP route before a later validation.
--
-- Additive/idempotent. No table/column is dropped and no live work order is deleted.

CREATE OR REPLACE FUNCTION maintenance.compute_v5_suffix(p_wo_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_wo record;
  v_ref text;
BEGIN
  SELECT
    NULLIF(BTRIM(external_vendor_invoice_number), '') AS external_vendor_invoice_number,
    NULLIF(BTRIM(external_vendor_wo_number), '') AS external_vendor_wo_number,
    labor_only_no_parts
  INTO v_wo
  FROM maintenance.work_orders
  WHERE id = p_wo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_WO_NOT_FOUND: %', p_wo_id;
  END IF;

  SELECT COALESCE(
    v_wo.external_vendor_invoice_number,
    v_wo.external_vendor_wo_number,
    (
      SELECT NULLIF(BTRIM(pil.vendor_invoice_number), '')
      FROM maintenance.parts_invoice_links pil
      WHERE pil.work_order_id = p_wo_id
        AND pil.voided_at IS NULL
        AND NULLIF(BTRIM(pil.vendor_invoice_number), '') IS NOT NULL
      ORDER BY pil.created_at ASC, pil.id ASC
      LIMIT 1
    )
  ) INTO v_ref;

  IF v_ref IS NOT NULL THEN
    RETURN LPAD(RIGHT(v_ref, 5), 5, '0');
  END IF;

  IF v_wo.labor_only_no_parts THEN
    RETURN 'LABOR';
  END IF;

  RETURN 'PEND0';
END
$function$;

CREATE OR REPLACE FUNCTION maintenance.next_wo_display_id(
  p_unit_id uuid,
  p_source_type text,
  p_date date,
  p_op_co_id uuid
) RETURNS TABLE(display_id text, sequence integer)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_unit_display_id text;
  v_seq integer;
BEGIN
  IF p_source_type NOT IN ('IS','ES','AC','ET','RT','IT','RS') THEN
    RAISE EXCEPTION 'E_INVALID_WO_SOURCE_TYPE: %', p_source_type;
  END IF;

  IF p_unit_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_HAS_NO_NUMBER: work order unit is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_unit_id::text));

  SELECT NULLIF(BTRIM(unit_number), '')
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
    'WO-', v_unit_display_id, '-', p_source_type, '-',
    TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'MM-DD-YYYY'), '-',
    LPAD(v_seq::text, 4, '0'), '-PEND0'
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
  v_wo record;
  v_unit_display_id text;
  v_v5 text;
  v_new_id text;
BEGIN
  SELECT * INTO v_wo
  FROM maintenance.work_orders
  WHERE id = p_wo_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_WO_NOT_FOUND: %', p_wo_id;
  END IF;

  IF v_wo.status IN ('complete', 'completed') THEN
    RAISE EXCEPTION 'E_WO_DISPLAY_ID_LOCKED';
  END IF;

  IF v_wo.v5_suffix IS NOT NULL AND v_wo.v5_suffix <> 'PEND0' THEN
    RETURN v_wo.display_id;
  END IF;

  IF v_wo.unit_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_HAS_NO_NUMBER: work order % has no unit', p_wo_id;
  END IF;

  SELECT NULLIF(BTRIM(unit_number), '')
  INTO v_unit_display_id
  FROM mdata.units
  WHERE id = v_wo.unit_id
    AND COALESCE(currently_leased_to_company_id, owner_company_id) = v_wo.operating_company_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_UNIT_NOT_FOUND: %', v_wo.unit_id;
  END IF;

  IF v_unit_display_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_HAS_NO_NUMBER: unit % has no unit_number -- cannot generate a work order number', v_wo.unit_id;
  END IF;

  v_v5 := maintenance.compute_v5_suffix(p_wo_id);
  v_new_id := CONCAT(
    'WO-', v_unit_display_id, '-', v_wo.source_type, '-',
    TO_CHAR(COALESCE(v_wo.opened_at, v_wo.created_at, now())::date, 'MM-DD-YYYY'), '-',
    LPAD(v_wo.unit_sequence::text, 4, '0'), '-', v_v5
  );

  UPDATE maintenance.work_orders
  SET display_id = v_new_id, v5_suffix = v_v5, updated_at = now()
  WHERE id = p_wo_id;

  RETURN v_new_id;
END
$function$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'maintenance.work_orders'::regclass
      AND conname = 'work_orders_active_unit_required_check'
  ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_active_unit_required_check
      CHECK (unit_id IS NOT NULL OR voided_at IS NOT NULL) NOT VALID;
  END IF;
END
$do$;

-- Repair display identities that already have a durable vendor/parts reference. Rows without a
-- source remain honestly PEND0. Null-unit legacy rows are handled through the audited void route.
DO $do$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT w.id
    FROM maintenance.work_orders w
    WHERE w.unit_id IS NOT NULL
      AND (w.v5_suffix IS NULL OR w.v5_suffix = 'PEND0')
      AND maintenance.compute_v5_suffix(w.id) <> 'PEND0'
  LOOP
    PERFORM maintenance.refresh_wo_display_id(v_id);
  END LOOP;
END
$do$;
