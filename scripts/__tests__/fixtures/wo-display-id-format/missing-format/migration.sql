CREATE OR REPLACE FUNCTION maintenance.compute_v5_suffix(p_wo_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'PEND0';
END
$$;

CREATE OR REPLACE FUNCTION maintenance.next_wo_display_id(
  p_unit_id uuid,
  p_source_type text,
  p_date date,
  p_op_co_id uuid
) RETURNS TABLE(display_id text, sequence int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq int := 1;
BEGIN
  display_id := CONCAT(
    'WO-',
    'UNIT',
    '-',
    p_source_type,
    '-',
    TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'MM-DD-YYYY'),
    '-',
    LPAD(v_seq::text, 4, '0')
  );
  sequence := v_seq;
  RETURN NEXT;
END
$$;
