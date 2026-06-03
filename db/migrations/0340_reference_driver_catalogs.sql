-- Block A17: Driver reference catalogs (license classes, endorsements, restrictions, medical card status, employment status)
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
  ('A', 'Class A — Combination vehicle', 10),
  ('B', 'Class B — Heavy straight vehicle', 20),
  ('C', 'Class C — Small vehicle', 30),
  ('AM', 'Class AM — Motorcycle', 40),
  ('BM', 'Class BM — Motorcycle + Class B', 50),
  ('CM', 'Class CM — Motorcycle + Class C', 60)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.license_classes existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.cdl_endorsements (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('H', 'Hazardous materials', 10),
  ('N', 'Tank vehicle', 20),
  ('P', 'Passenger', 30),
  ('S', 'School bus', 40),
  ('T', 'Double/triple trailers', 50),
  ('X', 'Tank + hazmat combination', 60)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.cdl_endorsements existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.cdl_restrictions (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('E', 'No manual transmission', 10),
  ('L', 'No air brake equipped CMV', 20),
  ('M', 'Class B/C bus only', 30),
  ('N', 'Class C passenger only', 40),
  ('O', 'No tractor-trailer', 50),
  ('V', 'Medical variance', 60),
  ('Z', 'No full air brake', 70)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.cdl_restrictions existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.medical_card_statuses (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('VALID', 'Valid', 10),
  ('EXPIRED', 'Expired', 20),
  ('PENDING', 'Pending review', 30),
  ('WAIVED', 'Waived / exempt', 40)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.medical_card_statuses existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

INSERT INTO reference.employment_statuses (code, label, sort_order)
SELECT v.code, v.label, v.sort_order
FROM (VALUES
  ('W2', 'W-2 employee', 10),
  ('1099', '1099 contractor', 20),
  ('PROBATIONARY', 'Probationary', 30),
  ('ACTIVE', 'Active', 40),
  ('TERMINATED', 'Terminated', 50),
  ('INACTIVE', 'Inactive', 60)
) AS v(code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reference.employment_statuses existing WHERE lower(existing.code) = lower(v.code) AND existing.archived_at IS NULL
);

COMMIT;
