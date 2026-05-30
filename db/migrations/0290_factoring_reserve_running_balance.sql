BEGIN;

CREATE SCHEMA IF NOT EXISTS factoring;

CREATE OR REPLACE VIEW factoring.v_factor_reserve_balance AS
SELECT
  tenant_id,
  factor_id,
  COALESCE(
    SUM(
      CASE
        WHEN direction = 'credit' THEN amount_cents
        WHEN direction = 'debit' THEN amount_cents * -1
        ELSE 0
      END
    ),
    0
  )::bigint AS balance_cents,
  MAX(created_at) AS last_movement_at,
  COUNT(*)::bigint AS movement_count
FROM factoring.reserve_movement
GROUP BY tenant_id, factor_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT ON factoring.v_factor_reserve_balance TO neondb_owner;
  END IF;
END
$$;

GRANT SELECT ON factoring.v_factor_reserve_balance TO ih35_app;

COMMIT;
