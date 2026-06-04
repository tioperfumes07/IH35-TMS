BEGIN;

-- Block B23: maintenance parts unification — deprecate legacy inventory surfaces.
-- Canonical company inventory = maintenance.parts_inventory (ARCHIVE-not-DELETE).

DO $$
BEGIN
  IF to_regclass('catalogs.parts') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE catalogs.parts IS %L',
      'DEPRECATED 2026-06-03 (B23): superseded by maintenance.parts_inventory. Kept per ARCHIVE-not-DELETE policy. Sunset: TBD.'
    );
  END IF;

  IF to_regclass('maint.part') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE maint.part IS %L',
      'DEPRECATED 2026-06-03 (B23): superseded by maintenance.parts_inventory. Kept per ARCHIVE-not-DELETE policy. Sunset: TBD.'
    );
  END IF;

  IF to_regclass('maintenance.parts_inventory') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE maintenance.parts_inventory IS %L',
      'CANONICAL company parts inventory (B23). Single source of truth for stocked parts. catalogs.maintenance_parts = taxonomy/codes only; reference.oem_parts = world knowledge.'
    );
  END IF;
END
$$;

COMMIT;

-- DOWN (manual rollback — run outside transaction if needed):
-- COMMENT ON TABLE catalogs.parts IS NULL;
-- COMMENT ON TABLE maint.part IS NULL;
-- COMMENT ON TABLE maintenance.parts_inventory IS NULL;
