-- [HOLD-FOR-JORGE — TIER 1] MNT-LINK-04 — maintenance vendor catalog → mdata.vendors AP link
--   + road_service_tickets.vendor_id RETIRE FK (mdata.qbo_vendors) → canonical mdata.vendors.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. ***
-- Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill.
--
-- PROD TRUTH (Neon br-fancy-credit-akjnd07a, lucia bypass 2026-07-26):
--   catalogs.maintenance_vendors has NO linked_vendor_id column (AP link lives only in metadata.mdata_vendor_id).
--   maintenance.road_service_tickets.vendor_id FK → mdata.qbo_vendors (RETIRE) — Law §10 forbids writing/FKing RETIRE.
--   Live counts: 0 road_service tickets; 0 maintenance_vendors with metadata mdata_vendor_id (safe apply).
--
-- FIX:
--   1) ADD catalogs.maintenance_vendors.linked_vendor_id → mdata.vendors(id) (nullable; backfill from metadata).
--   2) DROP road_service_tickets_vendor_id_fkey (qbo_vendors); ADD FK → mdata.vendors(id) NOT VALID→VALIDATE.
-- Idempotent / fresh-DB-safe / void-not-delete. No GL math. No feature flag.

BEGIN;

DO $$
DECLARE
  v_mv regclass := to_regclass('catalogs.maintenance_vendors');
  v_vendors regclass := to_regclass('mdata.vendors');
  v_tickets regclass := to_regclass('maintenance.road_service_tickets');
  v_orphans bigint;
BEGIN
  IF v_mv IS NULL OR v_vendors IS NULL THEN
    RAISE NOTICE 'MNT-LINK-04: catalogs.maintenance_vendors or mdata.vendors absent — skip catalog half';
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'catalogs' AND table_name = 'maintenance_vendors' AND column_name = 'linked_vendor_id'
    ) THEN
      ALTER TABLE catalogs.maintenance_vendors
        ADD COLUMN linked_vendor_id uuid NULL;
      RAISE NOTICE 'MNT-LINK-04: added catalogs.maintenance_vendors.linked_vendor_id';
    END IF;

    -- Backfill from metadata memo (C13 instance) when the uuid resolves to a live AP vendor.
    UPDATE catalogs.maintenance_vendors mv
       SET linked_vendor_id = (mv.metadata->>'mdata_vendor_id')::uuid
     WHERE mv.linked_vendor_id IS NULL
       AND (mv.metadata->>'mdata_vendor_id') ~ '^[0-9a-fA-F-]{36}$'
       AND EXISTS (
         SELECT 1 FROM mdata.vendors v
          WHERE v.id = (mv.metadata->>'mdata_vendor_id')::uuid
            AND v.operating_company_id = mv.operating_company_id
       );

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_maintenance_vendors_linked_vendor'
        AND conrelid = v_mv
    ) THEN
      SELECT COUNT(*)::bigint INTO v_orphans
      FROM catalogs.maintenance_vendors mv
      WHERE mv.linked_vendor_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.id = mv.linked_vendor_id);

      IF v_orphans > 0 THEN
        RAISE EXCEPTION
          'MNT-LINK-04 ABORT: % maintenance_vendors row(s) with linked_vendor_id not in mdata.vendors',
          v_orphans;
      END IF;

      ALTER TABLE catalogs.maintenance_vendors
        ADD CONSTRAINT fk_maintenance_vendors_linked_vendor
        FOREIGN KEY (linked_vendor_id)
        REFERENCES mdata.vendors(id)
        NOT VALID;

      ALTER TABLE catalogs.maintenance_vendors
        VALIDATE CONSTRAINT fk_maintenance_vendors_linked_vendor;

      RAISE NOTICE 'MNT-LINK-04: fk_maintenance_vendors_linked_vendor added + validated';
    END IF;

    CREATE INDEX IF NOT EXISTS idx_maintenance_vendors_linked_vendor
      ON catalogs.maintenance_vendors (operating_company_id, linked_vendor_id)
      WHERE linked_vendor_id IS NOT NULL;
  END IF;

  -- Road-service vendor_id: RETIRE qbo_vendors → canonical mdata.vendors
  IF v_tickets IS NULL OR v_vendors IS NULL THEN
    RAISE NOTICE 'MNT-LINK-04: road_service_tickets or mdata.vendors absent — skip ticket FK half';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'road_service_tickets_vendor_id_fkey'
      AND conrelid = v_tickets
  ) THEN
    ALTER TABLE maintenance.road_service_tickets
      DROP CONSTRAINT road_service_tickets_vendor_id_fkey;
    RAISE NOTICE 'MNT-LINK-04: dropped RETIRE FK road_service_tickets_vendor_id_fkey (mdata.qbo_vendors)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_road_service_tickets_vendor_mdata'
      AND conrelid = v_tickets
  ) THEN
    SELECT COUNT(*)::bigint INTO v_orphans
    FROM maintenance.road_service_tickets t
    WHERE t.vendor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.id = t.vendor_id);

    IF v_orphans > 0 THEN
      RAISE EXCEPTION
        'MNT-LINK-04 ABORT: % road_service_tickets row(s) with vendor_id not in mdata.vendors — repair before FK',
        v_orphans;
    END IF;

    ALTER TABLE maintenance.road_service_tickets
      ADD CONSTRAINT fk_road_service_tickets_vendor_mdata
      FOREIGN KEY (vendor_id)
      REFERENCES mdata.vendors(id)
      NOT VALID;

    ALTER TABLE maintenance.road_service_tickets
      VALIDATE CONSTRAINT fk_road_service_tickets_vendor_mdata;

    RAISE NOTICE 'MNT-LINK-04: fk_road_service_tickets_vendor_mdata → mdata.vendors added + validated';
  END IF;
END
$$;

COMMIT;
