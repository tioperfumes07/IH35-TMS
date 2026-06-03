-- Block A17: Driver reference lookup tables (global scope, archived_at pattern)
-- Reversible: see DOWN section at end of file.

BEGIN;

CREATE SCHEMA IF NOT EXISTS reference;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'license_classes',
    'cdl_endorsements',
    'cdl_restrictions',
    'medical_card_statuses',
    'employment_statuses'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS reference.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        label text NOT NULL,
        sort_order int NOT NULL DEFAULT 0,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )',
      tbl
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_%I_code_active ON reference.%I (lower(code)) WHERE archived_at IS NULL',
      tbl,
      tbl
    );
    EXECUTE format('ALTER TABLE reference.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON reference.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON reference.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_read ON reference.%I FOR SELECT TO ih35_app USING (true)',
      tbl,
      tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON reference.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_write ON reference.%I FOR ALL TO ih35_app USING (true) WITH CHECK (true)',
      tbl,
      tbl
    );
  END LOOP;
END
$$;

INSERT INTO reference.license_classes (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('A', 'Class A', 10),
  ('B', 'Class B', 20),
  ('C', 'Class C', 30),
  ('CDL-A', 'CDL Class A', 40),
  ('CDL-B', 'CDL Class B', 50),
  ('CDL-C', 'CDL Class C', 60)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.license_classes existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.cdl_endorsements (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('H', 'HazMat', 10),
  ('N', 'Tank', 20),
  ('P', 'Passenger', 30),
  ('S', 'School Bus', 40),
  ('T', 'Doubles/Triples', 50),
  ('X', 'Combined H+N', 60)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.cdl_endorsements existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.cdl_restrictions (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('L', 'Air Brake', 10),
  ('Z', 'Auto Trans', 20),
  ('E', 'Manual Trans', 30),
  ('M', 'Class A Passenger', 40),
  ('N', 'Class A School Bus', 50),
  ('O', 'No Tractor-Trailer', 60),
  ('V', 'Medical Variance', 70)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.cdl_restrictions existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.medical_card_statuses (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('CURRENT', 'Current', 10),
  ('EXPIRED', 'Expired', 20),
  ('EXPIRING-30', 'Expiring within 30 days', 30),
  ('EXPIRING-60', 'Expiring within 60 days', 40),
  ('EXPIRING-90', 'Expiring within 90 days', 50),
  ('NOT-ON-FILE', 'Not on file', 60)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.medical_card_statuses existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.employment_statuses (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('ACTIVE', 'Active', 10),
  ('LEAVE', 'Leave', 20),
  ('SUSPENDED', 'Suspended', 30),
  ('TERMINATED', 'Terminated', 40),
  ('APPLICANT', 'Applicant', 50),
  ('REHIRE-ELIGIBLE', 'Rehire eligible', 60),
  ('REHIRE-INELIGIBLE', 'Rehire ineligible', 70)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.employment_statuses existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

-- Deprecation comments on orphan catalogs.* driver tables (ARCHIVE-not-DELETE; no drops)
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT *
    FROM (VALUES
      ('driver_license_classes', 'license_classes'),
      ('license_classes', 'license_classes'),
      ('cdl_endorsements', 'cdl_endorsements'),
      ('cdl_restrictions', 'cdl_restrictions'),
      ('medical_card_statuses', 'medical_card_statuses'),
      ('employment_statuses', 'employment_statuses')
    ) AS t(catalog_table, reference_table)
  LOOP
    IF to_regclass('catalogs.' || rec.catalog_table) IS NOT NULL THEN
      EXECUTE format(
        'COMMENT ON TABLE catalogs.%I IS %L',
        rec.catalog_table,
        format(
          'DEPRECATED 2026-06-03: superseded by reference.%s. Empty in production. Kept per ARCHIVE-not-DELETE policy.',
          rec.reference_table
        )
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;

-- DOWN (manual rollback — run outside transaction if needed):
-- DELETE FROM reference.employment_statuses;
-- DELETE FROM reference.medical_card_statuses;
-- DELETE FROM reference.cdl_restrictions;
-- DELETE FROM reference.cdl_endorsements;
-- DELETE FROM reference.license_classes;
-- DROP TABLE IF EXISTS reference.employment_statuses;
-- DROP TABLE IF EXISTS reference.medical_card_statuses;
-- DROP TABLE IF EXISTS reference.cdl_restrictions;
-- DROP TABLE IF EXISTS reference.cdl_endorsements;
-- DROP TABLE IF EXISTS reference.license_classes;
