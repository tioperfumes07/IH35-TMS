BEGIN;

WITH source_rows AS (
  SELECT
    p.tenant_id,
    p.asset_id,
    p.pm_type,
    p.interval_miles,
    p.interval_days,
    p.last_done_miles,
    p.next_due_miles,
    p.created_at,
    p.updated_at,
    a.unit_code,
    a.samsara_unit_id,
    (
      substr(md5(p.tenant_id::text || ':' || p.asset_id::text || ':' || p.pm_type || ':' || coalesce(p.interval_miles::text, '') || ':' || coalesce(p.interval_days::text, '')), 1, 8) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.asset_id::text || ':' || p.pm_type || ':' || coalesce(p.interval_miles::text, '') || ':' || coalesce(p.interval_days::text, '')), 9, 4) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.asset_id::text || ':' || p.pm_type || ':' || coalesce(p.interval_miles::text, '') || ':' || coalesce(p.interval_days::text, '')), 13, 4) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.asset_id::text || ':' || p.pm_type || ':' || coalesce(p.interval_miles::text, '') || ':' || coalesce(p.interval_days::text, '')), 17, 4) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.asset_id::text || ':' || p.pm_type || ':' || coalesce(p.interval_miles::text, '') || ':' || coalesce(p.interval_days::text, '')), 21, 12)
    )::uuid AS deterministic_id
  FROM maint.pm_schedule p
  JOIN mdata.assets a ON a.id = p.asset_id
  WHERE p.tenant_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
),
resolved_units AS (
  SELECT DISTINCT ON (sr.deterministic_id)
    sr.*,
    u.id AS unit_id
  FROM source_rows sr
  JOIN mdata.units u
    ON COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = sr.tenant_id
   AND (
     (sr.samsara_unit_id IS NOT NULL AND u.samsara_vehicle_id = sr.samsara_unit_id)
     OR u.unit_number = sr.unit_code
   )
  ORDER BY sr.deterministic_id, u.created_at ASC
),
inserted AS (
  INSERT INTO maintenance.pm_schedules (
    id,
    operating_company_id,
    unit_id,
    label,
    interval_kind,
    interval_value,
    last_service_odometer,
    next_due_odometer,
    is_active,
    created_at,
    created_by_user_uuid
  )
  SELECT
    ru.deterministic_id,
    ru.tenant_id,
    ru.unit_id,
    ru.pm_type,
    CASE WHEN ru.interval_miles IS NOT NULL THEN 'miles' ELSE 'days' END,
    CASE WHEN ru.interval_miles IS NOT NULL THEN ru.interval_miles ELSE ru.interval_days END,
    ru.last_done_miles,
    ru.next_due_miles,
    true,
    ru.created_at,
    NULL
  FROM resolved_units ru
  WHERE COALESCE(ru.interval_miles, ru.interval_days) IS NOT NULL
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT COUNT(*)::int AS inserted_rows FROM inserted;

COMMIT;
