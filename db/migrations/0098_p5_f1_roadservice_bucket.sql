BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'wo_bucket_enum'
      AND n.nspname = 'maintenance'
  ) THEN
    CREATE TYPE maintenance.wo_bucket_enum AS ENUM ('in_house', 'external', 'roadside');
  END IF;
END $$;

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS bucket maintenance.wo_bucket_enum NOT NULL DEFAULT 'in_house',
  ADD COLUMN IF NOT EXISTS roadside_callout_at timestamptz,
  ADD COLUMN IF NOT EXISTS roadside_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS roadside_provider_vendor_id uuid REFERENCES mdata.vendors(id),
  ADD COLUMN IF NOT EXISTS roadside_location text,
  ADD COLUMN IF NOT EXISTS roadside_breakdown_load_id uuid REFERENCES mdata.loads(id);

ALTER TABLE maintenance.work_orders
  DROP COLUMN IF EXISTS roadside_response_minutes;

-- Self-heal: replay-safe generated column (matches 0123 drift reconciliation); IF NOT EXISTS avoids duplicate definition when reapplied.
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS roadside_response_minutes int GENERATED ALWAYS AS (
    CASE
      WHEN roadside_arrived_at IS NOT NULL AND roadside_callout_at IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (roadside_arrived_at - roadside_callout_at)) / 60)::int
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_wo_bucket
  ON maintenance.work_orders (operating_company_id, bucket, status);

COMMIT;
