-- INSURED-ASSET-RECONCILIATION-2026-08-31 (owner-assigned diagnosis, docs/bus/
-- CLAUDE-OWNED-INSURED-ASSET-RECONCILIATION-2026-08-31.md) -- ADDITIVE ONLY, per that doc's own
-- decision: "mdata.assets is the insurable asset register. It stays the FK target. We fix the
-- register, not the pointer." Two verified gaps this migration closes:
--
-- 1) insurance.policy_unit.asset_id resolves ONLY through mdata.assets, and mdata.assets carries
--    zero trailer rows and no way to reach one -- there is no equipment_id column at all, so a
--    trailer asset (mdata.equipment) has nowhere to link. This is why the 20 insured USMCA
--    trailers ($343,495 TIV) cannot be attached to any policy today.
-- 2) mdata.assets has ZERO foreign keys. tenant_id and unit_id are completely unconstrained --
--    verified live (information_schema.table_constraints for mdata.assets returns no FOREIGN KEY
--    rows). This is why duplicate/wrong-tenant asset rows (e.g. T163 registered under both
--    Transportation and USMCA) were never caught.
--
-- Schema only. No premium amounts posted, no policy_unit rows created, no asset rows created or
-- reassigned here -- those are separate, sequenced steps per the reconciliation doc (dedup +
-- owner entity-assignment ruling must land first).

BEGIN;

ALTER TABLE mdata.assets
  ADD COLUMN IF NOT EXISTS equipment_id uuid;

CREATE INDEX IF NOT EXISTS idx_mdata_assets_equipment_id ON mdata.assets (equipment_id);

COMMIT;

-- Foreign keys added NOT VALID first (does not scan/lock against existing rows at ADD time), then
-- VALIDATE CONSTRAINT in a separate transaction (only takes a lock while actually checking, and
-- fails loudly with the offending row rather than silently skipping it). Live-verified before
-- writing this migration: 0 of 90 mdata.assets rows fail either FK today (0 rows with a tenant_id
-- not in org.companies, 0 rows with a non-NULL unit_id not in mdata.units) -- so VALIDATE is
-- expected to succeed immediately, not merely queued for later.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mdata_assets_tenant_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    ALTER TABLE mdata.assets
      ADD CONSTRAINT mdata_assets_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES org.companies (id)
      NOT VALID;
  END IF;
END
$$;

COMMIT;

BEGIN;
ALTER TABLE mdata.assets VALIDATE CONSTRAINT mdata_assets_tenant_id_fkey;
COMMIT;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mdata_assets_unit_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    ALTER TABLE mdata.assets
      ADD CONSTRAINT mdata_assets_unit_id_fkey
      FOREIGN KEY (unit_id) REFERENCES mdata.units (id)
      NOT VALID;
  END IF;
END
$$;

COMMIT;

BEGIN;
ALTER TABLE mdata.assets VALIDATE CONSTRAINT mdata_assets_unit_id_fkey;
COMMIT;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mdata_assets_equipment_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    ALTER TABLE mdata.assets
      ADD CONSTRAINT mdata_assets_equipment_id_fkey
      FOREIGN KEY (equipment_id) REFERENCES mdata.equipment (id)
      NOT VALID;
  END IF;
END
$$;

COMMIT;

BEGIN;
ALTER TABLE mdata.assets VALIDATE CONSTRAINT mdata_assets_equipment_id_fkey;
COMMIT;
