-- Block A17.1: Wire mdata.drivers inline enums to reference.* FKs (A17 canonical catalogs)
-- Prerequisite: 0340_reference_driver_lookups.sql
-- Reversible: see DOWN section at end of file.

BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS license_class_id uuid,
  ADD COLUMN IF NOT EXISTS driver_employment_status_id uuid,
  ADD COLUMN IF NOT EXISTS medical_card_status_id uuid;

ALTER TABLE mdata.drivers
  DROP CONSTRAINT IF EXISTS drivers_license_class_id_fkey;
ALTER TABLE mdata.drivers
  ADD CONSTRAINT drivers_license_class_id_fkey
  FOREIGN KEY (license_class_id) REFERENCES reference.license_classes(id);

ALTER TABLE mdata.drivers
  DROP CONSTRAINT IF EXISTS drivers_driver_employment_status_id_fkey;
ALTER TABLE mdata.drivers
  ADD CONSTRAINT drivers_driver_employment_status_id_fkey
  FOREIGN KEY (driver_employment_status_id) REFERENCES reference.employment_statuses(id);

ALTER TABLE mdata.drivers
  DROP CONSTRAINT IF EXISTS drivers_medical_card_status_id_fkey;
ALTER TABLE mdata.drivers
  ADD CONSTRAINT drivers_medical_card_status_id_fkey
  FOREIGN KEY (medical_card_status_id) REFERENCES reference.medical_card_statuses(id);

CREATE TABLE IF NOT EXISTS mdata.driver_cdl_endorsements (
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  endorsement_id uuid NOT NULL REFERENCES reference.cdl_endorsements(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, endorsement_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_cdl_endorsements_endorsement
  ON mdata.driver_cdl_endorsements (endorsement_id);

CREATE TABLE IF NOT EXISTS mdata.driver_cdl_restrictions (
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  restriction_id uuid NOT NULL REFERENCES reference.cdl_restrictions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, restriction_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_cdl_restrictions_restriction
  ON mdata.driver_cdl_restrictions (restriction_id);

ALTER TABLE mdata.driver_cdl_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_cdl_endorsements FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_cdl_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_cdl_restrictions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_cdl_endorsements_select ON mdata.driver_cdl_endorsements;
CREATE POLICY driver_cdl_endorsements_select ON mdata.driver_cdl_endorsements
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS driver_cdl_endorsements_write ON mdata.driver_cdl_endorsements;
CREATE POLICY driver_cdl_endorsements_write ON mdata.driver_cdl_endorsements
  FOR ALL TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager') OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager') OR identity.is_lucia_bypass());

DROP POLICY IF EXISTS driver_cdl_restrictions_select ON mdata.driver_cdl_restrictions;
CREATE POLICY driver_cdl_restrictions_select ON mdata.driver_cdl_restrictions
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS driver_cdl_restrictions_write ON mdata.driver_cdl_restrictions;
CREATE POLICY driver_cdl_restrictions_write ON mdata.driver_cdl_restrictions
  FOR ALL TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager') OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager') OR identity.is_lucia_bypass());

GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.driver_cdl_endorsements TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.driver_cdl_restrictions TO ih35_app;

COMMENT ON COLUMN mdata.drivers.cdl_class IS
  'Legacy inline CDL class (A/B/C). Canonical FK: license_class_id → reference.license_classes. Kept for API backward compatibility.';
COMMENT ON COLUMN mdata.drivers.employment_status IS
  'Pay classification (w2/1099/probationary/terminated). Distinct from driver_employment_status_id (operational lifecycle → reference.employment_statuses).';
COMMENT ON COLUMN mdata.drivers.cdl_restrictions IS
  'Legacy free-text restrictions. Canonical links: mdata.driver_cdl_restrictions → reference.cdl_restrictions.';
COMMENT ON COLUMN mdata.drivers.endorsement_h IS
  'Legacy endorsement flag. Canonical links: mdata.driver_cdl_endorsements → reference.cdl_endorsements.';

CREATE OR REPLACE FUNCTION mdata.resolve_medical_card_status_id(expiry date)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM reference.medical_card_statuses
  WHERE archived_at IS NULL
    AND code = CASE
      WHEN expiry IS NULL THEN 'NOT-ON-FILE'
      WHEN expiry < CURRENT_DATE THEN 'EXPIRED'
      WHEN expiry <= CURRENT_DATE + 30 THEN 'EXPIRING-30'
      WHEN expiry <= CURRENT_DATE + 60 THEN 'EXPIRING-60'
      WHEN expiry <= CURRENT_DATE + 90 THEN 'EXPIRING-90'
      ELSE 'CURRENT'
    END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION mdata.sync_driver_reference_fks_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cdl_class IS NOT NULL THEN
    SELECT lc.id
    INTO NEW.license_class_id
    FROM reference.license_classes lc
    WHERE lower(lc.code) = lower(NEW.cdl_class)
      AND lc.archived_at IS NULL
    LIMIT 1;
  ELSE
    NEW.license_class_id := NULL;
  END IF;

  SELECT es.id
  INTO NEW.driver_employment_status_id
  FROM reference.employment_statuses es
  WHERE es.archived_at IS NULL
    AND es.code = CASE NEW.status::text
      WHEN 'Active' THEN 'ACTIVE'
      WHEN 'Probation' THEN 'APPLICANT'
      WHEN 'Inactive' THEN 'SUSPENDED'
      WHEN 'Terminated' THEN 'TERMINATED'
      WHEN 'OnLeave' THEN 'LEAVE'
      ELSE 'ACTIVE'
    END
  LIMIT 1;

  IF NEW.driver_employment_status_id IS NULL AND NEW.employment_status IS NOT NULL THEN
    SELECT es.id
    INTO NEW.driver_employment_status_id
    FROM reference.employment_statuses es
    WHERE es.archived_at IS NULL
      AND es.code = CASE lower(NEW.employment_status)
        WHEN 'probationary' THEN 'APPLICANT'
        WHEN 'terminated' THEN 'TERMINATED'
        ELSE NULL
      END
    LIMIT 1;
  END IF;

  NEW.medical_card_status_id := mdata.resolve_medical_card_status_id(NEW.dot_medical_expires_at);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_reference_fks_row ON mdata.drivers;
CREATE TRIGGER trg_sync_driver_reference_fks_row
  BEFORE INSERT OR UPDATE OF cdl_class, status, employment_status, dot_medical_expires_at
  ON mdata.drivers
  FOR EACH ROW
  EXECUTE FUNCTION mdata.sync_driver_reference_fks_row();

CREATE OR REPLACE FUNCTION mdata.sync_driver_endorsement_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rec record;
BEGIN
  DELETE FROM mdata.driver_cdl_endorsements WHERE driver_id = NEW.id;

  FOR rec IN
    SELECT *
    FROM (VALUES
      ('H', NEW.endorsement_h),
      ('N', NEW.endorsement_n),
      ('P', NEW.endorsement_p),
      ('S', NEW.endorsement_s),
      ('T', NEW.endorsement_t),
      ('X', NEW.endorsement_x)
    ) AS v(code, enabled)
    WHERE enabled IS TRUE
  LOOP
    INSERT INTO mdata.driver_cdl_endorsements (driver_id, endorsement_id)
    SELECT NEW.id, e.id
    FROM reference.cdl_endorsements e
    WHERE upper(e.code) = rec.code
      AND e.archived_at IS NULL
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_endorsement_links ON mdata.drivers;
CREATE TRIGGER trg_sync_driver_endorsement_links
  AFTER INSERT OR UPDATE OF endorsement_h, endorsement_n, endorsement_p, endorsement_s, endorsement_t, endorsement_x
  ON mdata.drivers
  FOR EACH ROW
  EXECUTE FUNCTION mdata.sync_driver_endorsement_links();

CREATE OR REPLACE FUNCTION mdata.sync_driver_restriction_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  token text;
BEGIN
  DELETE FROM mdata.driver_cdl_restrictions WHERE driver_id = NEW.id;

  IF NEW.cdl_restrictions IS NULL OR btrim(NEW.cdl_restrictions) = '' THEN
    RETURN NEW;
  END IF;

  FOR token IN
    SELECT DISTINCT upper(btrim(t))
    FROM regexp_split_to_table(NEW.cdl_restrictions, '[,\s/;]+') AS t
    WHERE btrim(t) <> ''
  LOOP
    INSERT INTO mdata.driver_cdl_restrictions (driver_id, restriction_id)
    SELECT NEW.id, r.id
    FROM reference.cdl_restrictions r
    WHERE upper(r.code) = token
      AND r.archived_at IS NULL
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_restriction_links ON mdata.drivers;
CREATE TRIGGER trg_sync_driver_restriction_links
  AFTER INSERT OR UPDATE OF cdl_restrictions
  ON mdata.drivers
  FOR EACH ROW
  EXECUTE FUNCTION mdata.sync_driver_restriction_links();

-- Backfill existing rows (no-op when table empty)
UPDATE mdata.drivers
SET
  cdl_class = cdl_class,
  status = status,
  employment_status = employment_status,
  dot_medical_expires_at = dot_medical_expires_at,
  endorsement_h = endorsement_h,
  endorsement_n = endorsement_n,
  endorsement_p = endorsement_p,
  endorsement_s = endorsement_s,
  endorsement_t = endorsement_t,
  endorsement_x = endorsement_x,
  cdl_restrictions = cdl_restrictions;

COMMIT;

-- DOWN (manual rollback):
-- DROP TRIGGER IF EXISTS trg_sync_driver_restriction_links ON mdata.drivers;
-- DROP TRIGGER IF EXISTS trg_sync_driver_endorsement_links ON mdata.drivers;
-- DROP TRIGGER IF EXISTS trg_sync_driver_reference_fks_row ON mdata.drivers;
-- DROP FUNCTION IF EXISTS mdata.sync_driver_restriction_links();
-- DROP FUNCTION IF EXISTS mdata.sync_driver_endorsement_links();
-- DROP FUNCTION IF EXISTS mdata.sync_driver_reference_fks_row();
-- DROP FUNCTION IF EXISTS mdata.resolve_medical_card_status_id(date);
-- DROP TABLE IF EXISTS mdata.driver_cdl_restrictions;
-- DROP TABLE IF EXISTS mdata.driver_cdl_endorsements;
-- ALTER TABLE mdata.drivers DROP COLUMN IF EXISTS medical_card_status_id;
-- ALTER TABLE mdata.drivers DROP COLUMN IF EXISTS driver_employment_status_id;
-- ALTER TABLE mdata.drivers DROP COLUMN IF EXISTS license_class_id;
