BEGIN;

CREATE SCHEMA IF NOT EXISTS views;
CREATE SCHEMA IF NOT EXISTS safety;

DO $$
BEGIN
  IF to_regclass('mdata.units') IS NULL THEN
    RAISE NOTICE 'Skipping dispatch gate migration: mdata.units missing';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'mdata'
      AND table_name = 'units'
      AND column_name = 'is_dispatch_blocked'
  ) THEN
    ALTER TABLE mdata.units
      ADD COLUMN is_dispatch_blocked boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'mdata'
      AND table_name = 'units'
      AND column_name = 'dispatch_block_reason'
  ) THEN
    ALTER TABLE mdata.units
      ADD COLUMN dispatch_block_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'mdata'
      AND table_name = 'units'
      AND column_name = 'dispatch_block_source_uuid'
  ) THEN
    ALTER TABLE mdata.units
      ADD COLUMN dispatch_block_source_uuid uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'mdata'
      AND table_name = 'units'
      AND column_name = 'dispatch_block_source_type'
  ) THEN
    ALTER TABLE mdata.units
      ADD COLUMN dispatch_block_source_type text;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION safety.set_unit_dispatch_block(
  p_unit_id uuid,
  p_reason text,
  p_source_uuid uuid,
  p_source_type text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mdata.units
  SET
    is_dispatch_blocked = true,
    dispatch_block_reason = p_reason,
    dispatch_block_source_uuid = p_source_uuid,
    dispatch_block_source_type = p_source_type,
    updated_at = now()
  WHERE id = p_unit_id;
END
$$;

CREATE OR REPLACE FUNCTION safety.clear_unit_dispatch_block(
  p_unit_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mdata.units
  SET
    is_dispatch_blocked = false,
    dispatch_block_reason = NULL,
    dispatch_block_source_uuid = NULL,
    dispatch_block_source_type = NULL,
    updated_at = now()
  WHERE id = p_unit_id;
END
$$;

DO $$
BEGIN
  IF to_regclass('mdata.units') IS NOT NULL
     AND to_regclass('maintenance.work_orders') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.units_with_dispatch_status
      WITH (security_invoker = true) AS
      SELECT
        u.id,
        COALESCE(u.unit_number, u.id::text) AS display_id,
        COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS operating_company_id,
        u.is_dispatch_blocked,
        u.dispatch_block_reason,
        u.dispatch_block_source_type,
        EXISTS (
          SELECT 1
          FROM maintenance.work_orders wo
          WHERE wo.unit_id = u.id
            AND wo.status IN ('open', 'in_progress', 'waiting_parts')
            AND wo.wo_type = 'pm'
        ) AS has_open_pm_due_wo,
        (
          SELECT COUNT(*)::int
          FROM maintenance.work_orders wo
          WHERE wo.unit_id = u.id
            AND wo.status IN ('open', 'in_progress', 'waiting_parts')
        ) AS open_wo_count
      FROM mdata.units u
      WHERE u.deactivated_at IS NULL
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.units_with_dispatch_status
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::text AS display_id,
        NULL::uuid AS operating_company_id,
        false AS is_dispatch_blocked,
        NULL::text AS dispatch_block_reason,
        NULL::text AS dispatch_block_source_type,
        false AS has_open_pm_due_wo,
        0::int AS open_wo_count
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NOT NULL
     AND to_regclass('safety.driver_hos_status') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.drivers_with_hos_status
      WITH (security_invoker = true) AS
      SELECT
        d.id,
        d.id::text AS display_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS full_name,
        d.operating_company_id,
        COALESCE(hos.is_in_violation, false) AS is_in_violation,
        COALESCE(hos.minutes_until_violation, 9999) AS minutes_until_violation,
        hos.last_status_at,
        CASE
          WHEN COALESCE(hos.is_in_violation, false) THEN 'red'
          WHEN COALESCE(hos.minutes_until_violation, 9999) < 60 THEN 'yellow'
          ELSE 'green'
        END AS hos_badge_color
      FROM mdata.drivers d
      LEFT JOIN safety.driver_hos_status hos ON hos.driver_id = d.id
      WHERE d.status = 'active'
        AND d.deactivated_at IS NULL
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.drivers_with_hos_status
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::text AS display_id,
        NULL::text AS full_name,
        NULL::uuid AS operating_company_id,
        false AS is_in_violation,
        0::int AS minutes_until_violation,
        NULL::timestamptz AS last_status_at,
        NULL::text AS hos_badge_color
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;
