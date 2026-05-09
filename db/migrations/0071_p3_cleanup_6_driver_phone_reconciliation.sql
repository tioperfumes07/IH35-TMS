BEGIN;

DO $$
DECLARE
  v_now timestamptz := now();
BEGIN
  CREATE TEMP TABLE tmp_driver_phone_reconciled (
    driver_id uuid PRIMARY KEY,
    identity_user_id uuid NOT NULL,
    old_driver_phone text,
    new_identity_phone text
  ) ON COMMIT DROP;

  INSERT INTO tmp_driver_phone_reconciled (driver_id, identity_user_id, old_driver_phone, new_identity_phone)
  SELECT
    d.id,
    u.id,
    d.phone,
    u.phone
  FROM mdata.drivers d
  JOIN identity.users u ON u.id = d.identity_user_id
  WHERE u.phone IS NOT NULL
    AND d.phone IS DISTINCT FROM u.phone;

  UPDATE mdata.drivers d
  SET
    phone = t.new_identity_phone,
    updated_at = v_now
  FROM tmp_driver_phone_reconciled t
  WHERE d.id = t.driver_id;

  PERFORM audit.append_event(
    'mdata.drivers.phone_reconciled',
    'info',
    jsonb_build_object(
      'entity_type', 'mdata.drivers',
      'entity_id', t.driver_id,
      'identity_user_id', t.identity_user_id,
      'driver_phone_before', t.old_driver_phone,
      'driver_phone_after', t.new_identity_phone,
      'reason', 'p3_cleanup_6_bug_5_phone_sync'
    ),
    NULL,
    'migration:0071_p3_cleanup_6_driver_phone_reconciliation'
  )
  FROM tmp_driver_phone_reconciled t;
END
$$;

COMMIT;
