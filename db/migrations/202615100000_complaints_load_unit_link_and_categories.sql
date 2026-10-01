-- 202615100000_complaints_load_unit_link_and_categories.sql
-- E-28 (owner order 2026-10-01, no handoff — docs/bus/2026-10-01-OWNER-ORDER-CC-2-NO-HANDOFF-BUILD-OWN-MIGRATIONS.md):
-- a complaint against a driver carries "category (lateness, refused dispatch, conduct, damage),
-- date, load and unit where applicable ... Linkage both ways: driver -> complaints, load -> complaints."
-- safety.complaints had no load_id and no unit_id, so load -> complaints could not exist.
--
-- ADDITIVE + IDEMPOTENT. Two nullable FK columns + indexes; a same-company guard so a complaint can
-- never point at another entity's load or truck (linkage law: provably same-entity); and the three
-- owner categories in catalogs.complaint_types for USMCA (CONDUCT is the existing MISCONDUCT).
-- No complaint row is written. Catalog rows are reference data for the engine, resolved by company
-- code — no hardcoded uuid; a database without USMCA (fresh CI) inserts none.

BEGIN;

ALTER TABLE safety.complaints ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id);
ALTER TABLE safety.complaints ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);
CREATE INDEX IF NOT EXISTS idx_safety_complaints_load ON safety.complaints (operating_company_id, load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_complaints_unit ON safety.complaints (operating_company_id, unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_complaints_respondent_driver ON safety.complaints (operating_company_id, respondent_driver_id) WHERE respondent_driver_id IS NOT NULL;

CREATE OR REPLACE FUNCTION safety.tg_complaints_same_company_links() RETURNS trigger AS $$
BEGIN
  IF NEW.load_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM mdata.loads l WHERE l.id = NEW.load_id AND l.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'safety.complaints: load % does not belong to company %', NEW.load_id, NEW.operating_company_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM mdata.units u WHERE u.id = NEW.unit_id
          AND (u.owner_company_id = NEW.operating_company_id OR u.currently_leased_to_company_id = NEW.operating_company_id)) THEN
    RAISE EXCEPTION 'safety.complaints: unit % is not in company %''s fleet', NEW.unit_id, NEW.operating_company_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_same_company_links ON safety.complaints;
CREATE TRIGGER trg_complaints_same_company_links
  BEFORE INSERT OR UPDATE OF load_id, unit_id, operating_company_id ON safety.complaints
  FOR EACH ROW EXECUTE FUNCTION safety.tg_complaints_same_company_links();

INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity, is_active)
SELECT c.id, v.type_code, v.type_name, v.default_severity, true
  FROM org.companies c
 CROSS JOIN (VALUES
   ('LATENESS', 'Lateness', 'medium'),
   ('REFUSED-DISPATCH', 'Refused dispatch', 'high'),
   ('DAMAGE', 'Damage', 'high')
 ) AS v(type_code, type_name, default_severity)
 WHERE c.code = 'USMCA'
ON CONFLICT (operating_company_id, type_code) DO NOTHING;

COMMIT;
