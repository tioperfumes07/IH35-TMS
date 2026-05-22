BEGIN;

-- DS-REMEDIATE-8.1
-- Replace DS-8 GENERATED canonical columns with real columns + sync triggers.

-- qbo_accounts
DROP TRIGGER IF EXISTS trg_qbo_accounts_canonical_sync ON mdata.qbo_accounts;
DROP FUNCTION IF EXISTS mdata.qbo_accounts_canonical_sync_fn();

ALTER TABLE mdata.qbo_accounts
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_accounts
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_accounts
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_accounts
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_accounts_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_accounts_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_accounts_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_accounts
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_accounts_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_accounts_last_seen_at
  ON mdata.qbo_accounts (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_accounts TO ih35_app;

-- qbo_classes
DROP TRIGGER IF EXISTS trg_qbo_classes_canonical_sync ON mdata.qbo_classes;
DROP FUNCTION IF EXISTS mdata.qbo_classes_canonical_sync_fn();

ALTER TABLE mdata.qbo_classes
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_classes
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_classes
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_classes
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_classes_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_classes_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_classes_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_classes
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_classes_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_classes_last_seen_at
  ON mdata.qbo_classes (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_classes TO ih35_app;

-- qbo_customers
DROP TRIGGER IF EXISTS trg_qbo_customers_canonical_sync ON mdata.qbo_customers;
DROP FUNCTION IF EXISTS mdata.qbo_customers_canonical_sync_fn();

ALTER TABLE mdata.qbo_customers
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_customers
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_customers
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_customers
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_customers_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_customers_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_customers_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_customers
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_customers_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_customers_last_seen_at
  ON mdata.qbo_customers (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_customers TO ih35_app;

-- qbo_items
DROP TRIGGER IF EXISTS trg_qbo_items_canonical_sync ON mdata.qbo_items;
DROP FUNCTION IF EXISTS mdata.qbo_items_canonical_sync_fn();

ALTER TABLE mdata.qbo_items
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_items
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_items
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_items
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_items_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_items_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_items_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_items
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_items_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_items_last_seen_at
  ON mdata.qbo_items (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_items TO ih35_app;

-- qbo_vendors
DROP TRIGGER IF EXISTS trg_qbo_vendors_canonical_sync ON mdata.qbo_vendors;
DROP FUNCTION IF EXISTS mdata.qbo_vendors_canonical_sync_fn();

ALTER TABLE mdata.qbo_vendors
  DROP COLUMN IF EXISTS raw_payload,
  DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE mdata.qbo_vendors
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mdata.qbo_vendors
SET
  raw_payload = COALESCE(payload_json, '{}'::jsonb),
  last_seen_at = COALESCE(mirrored_at, now())
WHERE raw_payload IS NULL OR last_seen_at IS NULL;

ALTER TABLE mdata.qbo_vendors
  ALTER COLUMN raw_payload SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE OR REPLACE FUNCTION mdata.qbo_vendors_canonical_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.raw_payload := COALESCE(NEW.payload_json, '{}'::jsonb);
  NEW.last_seen_at := COALESCE(NEW.mirrored_at, NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION mdata.qbo_vendors_canonical_sync_fn() TO ih35_app;

CREATE TRIGGER trg_qbo_vendors_canonical_sync
BEFORE INSERT OR UPDATE ON mdata.qbo_vendors
FOR EACH ROW
EXECUTE FUNCTION mdata.qbo_vendors_canonical_sync_fn();

CREATE INDEX IF NOT EXISTS ix_qbo_vendors_last_seen_at
  ON mdata.qbo_vendors (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_vendors TO ih35_app;

-- Samsara mirrors (minimal treatment, no triggers)
ALTER TABLE integrations.samsara_drivers
  ALTER COLUMN raw_payload SET NOT NULL;

ALTER TABLE integrations.samsara_vehicles
  ALTER COLUMN raw_payload SET NOT NULL;

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_drivers TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_vehicles TO ih35_app;

COMMIT;
