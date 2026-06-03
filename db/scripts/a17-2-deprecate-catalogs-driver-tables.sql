-- A17.2 — idempotent deprecation comments on PR #403 catalogs.driver_* tables.
-- Metadata only (reversible). Canonical data: reference.* + archived_at (migration 0340).

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT *
    FROM (VALUES
      ('driver_license_classes', 'reference.license_classes'),
      ('license_classes', 'reference.license_classes'),
      ('cdl_endorsements', 'reference.cdl_endorsements'),
      ('cdl_restrictions', 'reference.cdl_restrictions'),
      ('medical_card_statuses', 'reference.medical_card_statuses'),
      ('employment_statuses', 'reference.employment_statuses')
    ) AS t(catalog_table, reference_table)
  LOOP
    IF to_regclass('catalogs.' || rec.catalog_table) IS NOT NULL THEN
      EXECUTE format(
        'COMMENT ON TABLE catalogs.%I IS %L',
        rec.catalog_table,
        format(
          'DEPRECATED 2026-06-03 by A17.2: superseded by %s (canonical per A17 reference.* + archived_at decision). Empty in production. Kept per ARCHIVE-not-DELETE policy. Do NOT query or extend.',
          rec.reference_table
        )
      );
    END IF;
  END LOOP;
END
$$;
