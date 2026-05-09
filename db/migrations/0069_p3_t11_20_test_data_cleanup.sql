BEGIN;

DO $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- 1) Test customers: soft-delete/void (idempotent)
  CREATE TEMP TABLE tmp_void_customers (id uuid PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO tmp_void_customers (id)
  SELECT c.id
  FROM mdata.customers c
  WHERE (
    c.customer_name ILIKE '%CQ Test%'
    OR c.customer_name ILIKE '%Test Customer%'
    OR c.customer_name ILIKE '%test%'
  )
    AND (
      c.deactivated_at IS NULL
      OR c.status IS DISTINCT FROM 'inactive'
    );

  UPDATE mdata.customers c
  SET
    status = 'inactive'::mdata.customer_status,
    deactivated_at = COALESCE(c.deactivated_at, v_now),
    updated_at = v_now
  WHERE c.id IN (SELECT id FROM tmp_void_customers);

  PERFORM audit.append_event(
    'mdata.customers.test_data_voided',
    'info',
    jsonb_build_object(
      'entity_type', 'mdata.customers',
      'entity_id', t.id,
      'reason', 'test_data_cleanup_pre_launch'
    ),
    NULL,
    'migration:0069_p3_t11_20_test_data_cleanup'
  )
  FROM tmp_void_customers t;

  -- 2) Orphan driver-role identities: deactivate users (idempotent)
  CREATE TEMP TABLE tmp_deactivated_identity_users (id uuid PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO tmp_deactivated_identity_users (id)
  SELECT u.id
  FROM identity.users u
  WHERE u.role = 'Driver'
    AND u.deactivated_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM mdata.drivers d WHERE d.identity_user_id = u.id
    );

  UPDATE identity.users u
  SET deactivated_at = v_now
  WHERE u.id IN (SELECT id FROM tmp_deactivated_identity_users);

  PERFORM audit.append_event(
    'identity.users.driver_orphan_deactivated',
    'info',
    jsonb_build_object(
      'entity_type', 'identity.users',
      'entity_id', t.id,
      'reason', 'test_data_cleanup_pre_launch'
    ),
    NULL,
    'migration:0069_p3_t11_20_test_data_cleanup'
  )
  FROM tmp_deactivated_identity_users t;

  -- 3) Orphan mdata.drivers: set inactive + deactivate (idempotent)
  CREATE TEMP TABLE tmp_void_drivers (id uuid PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO tmp_void_drivers (id)
  SELECT d.id
  FROM mdata.drivers d
  WHERE d.deactivated_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM identity.users u WHERE u.id = d.identity_user_id
    );

  UPDATE mdata.drivers d
  SET
    status = 'Inactive'::mdata.driver_status,
    deactivated_at = COALESCE(d.deactivated_at, v_now),
    updated_at = v_now
  WHERE d.id IN (SELECT id FROM tmp_void_drivers);

  PERFORM audit.append_event(
    'mdata.drivers.test_data_voided',
    'info',
    jsonb_build_object(
      'entity_type', 'mdata.drivers',
      'entity_id', t.id,
      'reason', 'test_data_cleanup_pre_launch'
    ),
    NULL,
    'migration:0069_p3_t11_20_test_data_cleanup'
  )
  FROM tmp_void_drivers t;

  -- 4a) Test internal fines: void (idempotent)
  CREATE TEMP TABLE tmp_void_internal_fines (id uuid PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO tmp_void_internal_fines (id)
  SELECT f.id
  FROM safety.internal_fines f
  WHERE COALESCE(f.notes, '') ILIKE '%test%'
    AND (
      f.status IS DISTINCT FROM 'voided'
      OR f.voided_at IS NULL
    );

  UPDATE safety.internal_fines f
  SET
    status = 'voided',
    voided_at = COALESCE(f.voided_at, v_now),
    voided_reason = COALESCE(f.voided_reason, 'test_data_cleanup_pre_launch')
  WHERE f.id IN (SELECT id FROM tmp_void_internal_fines);

  PERFORM audit.append_event(
    'safety.internal_fines.test_data_voided',
    'info',
    jsonb_build_object(
      'entity_type', 'safety.internal_fines',
      'entity_id', t.id,
      'reason', 'test_data_cleanup_pre_launch'
    ),
    NULL,
    'migration:0069_p3_t11_20_test_data_cleanup'
  )
  FROM tmp_void_internal_fines t;

  -- 4b) Test loads: cancel + soft-delete timestamp (idempotent)
  CREATE TEMP TABLE tmp_void_loads (id uuid PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO tmp_void_loads (id)
  SELECT l.id
  FROM mdata.loads l
  WHERE (
    l.load_number LIKE 'L-TEST%'
    OR l.load_number LIKE 'L-99%'
  )
    AND (
      l.soft_deleted_at IS NULL
      OR l.status::text IS DISTINCT FROM 'cancelled'
    );

  UPDATE mdata.loads l
  SET
    status = 'cancelled'::mdata.load_status_enum,
    soft_deleted_at = COALESCE(l.soft_deleted_at, v_now),
    updated_at = v_now
  WHERE l.id IN (SELECT id FROM tmp_void_loads);

  PERFORM audit.append_event(
    'mdata.loads.test_data_voided',
    'info',
    jsonb_build_object(
      'entity_type', 'mdata.loads',
      'entity_id', t.id,
      'reason', 'test_data_cleanup_pre_launch'
    ),
    NULL,
    'migration:0069_p3_t11_20_test_data_cleanup'
  )
  FROM tmp_void_loads t;

  -- 4c) Test work orders: cancel (idempotent)
  CREATE TEMP TABLE tmp_void_work_orders (id uuid PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO tmp_void_work_orders (id)
  SELECT w.id
  FROM maintenance.work_orders w
  WHERE w.display_id LIKE 'WO-TEST%'
    AND w.status IS DISTINCT FROM 'cancelled';

  UPDATE maintenance.work_orders w
  SET
    status = 'cancelled',
    updated_at = v_now
  WHERE w.id IN (SELECT id FROM tmp_void_work_orders);

  PERFORM audit.append_event(
    'maintenance.work_orders.test_data_voided',
    'info',
    jsonb_build_object(
      'entity_type', 'maintenance.work_orders',
      'entity_id', t.id,
      'reason', 'test_data_cleanup_pre_launch'
    ),
    NULL,
    'migration:0069_p3_t11_20_test_data_cleanup'
  )
  FROM tmp_void_work_orders t;
END
$$;

COMMIT;
