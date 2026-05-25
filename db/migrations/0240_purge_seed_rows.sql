BEGIN;

DO $$
DECLARE
  v_now timestamptz := now();
  v_reason text := 'seed-purge-prod 2026-05-24 P7-AUDIT-VISUAL-P1';
  v_row record;
BEGIN
  CREATE TEMP TABLE tmp_void_seed (entity_type text, entity_id uuid) ON COMMIT DROP;

  IF to_regclass('mdata.drivers') IS NOT NULL THEN
    INSERT INTO tmp_void_seed(entity_type, entity_id)
    SELECT 'mdata.drivers', d.id
    FROM mdata.drivers d
    WHERE (
      COALESCE(d.display_id, '') = 'TEST-DRIVER'
      OR COALESCE(d.display_id, '') ILIKE 'seed-test-%'
      OR COALESCE(d.driver_name, '') ILIKE '%TEST%'
    )
      AND (
        d.deactivated_at IS NULL
        OR d.status::text <> 'Inactive'
      );

    UPDATE mdata.drivers d
    SET
      deactivated_at = COALESCE(d.deactivated_at, v_now),
      status = CASE WHEN d.status::text = 'Inactive' THEN d.status ELSE 'Inactive'::mdata.driver_status END,
      updated_at = v_now
    WHERE d.id IN (SELECT entity_id FROM tmp_void_seed WHERE entity_type = 'mdata.drivers');
  END IF;

  IF to_regclass('mdata.customers') IS NOT NULL THEN
    INSERT INTO tmp_void_seed(entity_type, entity_id)
    SELECT 'mdata.customers', c.id
    FROM mdata.customers c
    WHERE (
      COALESCE(c.display_id, '') = 'TEST-CUSTOMER'
      OR COALESCE(c.display_id, '') ILIKE 'seed-test-%'
      OR COALESCE(c.customer_name, '') ILIKE '%TEST%'
    )
      AND (
        c.deactivated_at IS NULL
        OR c.status::text <> 'inactive'
      );

    UPDATE mdata.customers c
    SET
      deactivated_at = COALESCE(c.deactivated_at, v_now),
      status = CASE WHEN c.status::text = 'inactive' THEN c.status ELSE 'inactive'::mdata.customer_status END,
      updated_at = v_now
    WHERE c.id IN (SELECT entity_id FROM tmp_void_seed WHERE entity_type = 'mdata.customers');
  END IF;

  FOR v_row IN SELECT * FROM tmp_void_seed LOOP
    PERFORM audit.append_event(
      v_row.entity_type || '.seed_purge_prod_voided',
      'info',
      jsonb_build_object(
        'entity_type', v_row.entity_type,
        'entity_id', v_row.entity_id,
        'voided_at', v_now,
        'voided_reason', v_reason
      ),
      NULL,
      'migration:0240_purge_seed_rows'
    );
  END LOOP;
END
$$;

COMMIT;
