-- LV-DEAD-SEEDED-FLAGS
-- Archive unread feature flags in place (ADDITIVE — never DELETE).
-- PERIODS_INIT_ENABLED / PREPAID_EXPENSES_ENABLED / IFTA_TRIP_METHODOLOGY_ENABLED have
-- zero production readers (CC-3 2026-08-07). Keep rows for history; hide from admin list
-- and force isEnabled=false when archived_at IS NOT NULL.

ALTER TABLE lib.feature_flags
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE lib.feature_flags
SET
  archived_at = COALESCE(archived_at, now()),
  description = CASE
    WHEN description ILIKE '%[ARCHIVED — LV-DEAD-SEEDED-FLAGS]%' THEN description
    ELSE trim(both FROM COALESCE(description, '')) || ' [ARCHIVED — LV-DEAD-SEEDED-FLAGS]'
  END
WHERE flag_key IN (
  'PERIODS_INIT_ENABLED',
  'PREPAID_EXPENSES_ENABLED',
  'IFTA_TRIP_METHODOLOGY_ENABLED'
)
  AND archived_at IS NULL;
