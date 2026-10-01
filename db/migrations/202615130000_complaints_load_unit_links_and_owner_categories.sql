-- 202615130000_complaints_load_unit_links_and_owner_categories.sql
-- ORDERS 2026-10-01 CC-1 row 5, for CC-2's E-28 (lane-barred from migrations). CC-2 filed
-- COMPLAINTS-NO-LOAD-UNIT-LINK-AND-OWNER-CATEGORIES-MISSING-2026100102 (#23610): safety.complaints had no
-- load_id / unit_id, so a complaint could never link to the trip or truck it is about, and the owner's
-- categories (lateness, refused dispatch, damage) did not exist.
--
-- 1. load_id -> mdata.loads, unit_id -> mdata.units, both nullable and indexed (partial, NOT NULL rows).
--    FKs are added NOT VALID then VALIDATEd: the ADD takes only a momentary lock on the referenced hub
--    tables and VALIDATE takes SHARE UPDATE EXCLUSIVE (no write block); lock_timeout so it never queues
--    behind live traffic (mdata.drivers lock-pileup lesson).
-- 2. Categories are a CATALOG here (catalogs.complaint_types, FK (complaint_type_id, operating_company_id)),
--    not a CHECK -- so the owner's three are added as catalog types for USMCA, existence-guarded so a
--    fresh database (no USMCA) no-ops instead of failing the chain.
-- RLS unchanged. Additive only.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE safety.complaints
  ADD COLUMN IF NOT EXISTS load_id uuid,
  ADD COLUMN IF NOT EXISTS unit_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_load_id_fkey' AND conrelid = 'safety.complaints'::regclass) THEN
    ALTER TABLE safety.complaints ADD CONSTRAINT complaints_load_id_fkey FOREIGN KEY (load_id) REFERENCES mdata.loads(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_unit_id_fkey' AND conrelid = 'safety.complaints'::regclass) THEN
    ALTER TABLE safety.complaints ADD CONSTRAINT complaints_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES mdata.units(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE safety.complaints VALIDATE CONSTRAINT complaints_load_id_fkey;
ALTER TABLE safety.complaints VALIDATE CONSTRAINT complaints_unit_id_fkey;

CREATE INDEX IF NOT EXISTS idx_complaints_load_id ON safety.complaints (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_unit_id ON safety.complaints (unit_id) WHERE unit_id IS NOT NULL;

INSERT INTO catalogs.complaint_types (operating_company_id, type_code, type_name, default_severity, is_active)
SELECT c.id, v.type_code, v.type_name, v.default_severity, true
  FROM org.companies c
  CROSS JOIN (VALUES
    ('LATENESS',         'Lateness',          'medium'),
    ('REFUSED-DISPATCH', 'Refused dispatch',  'high'),
    ('DAMAGE',           'Damage',            'high')
  ) AS v(type_code, type_name, default_severity)
 WHERE c.id = '5c854333-6ea5-4faa-af31-67cb272fef80'
ON CONFLICT (operating_company_id, type_code) DO NOTHING;

COMMIT;
