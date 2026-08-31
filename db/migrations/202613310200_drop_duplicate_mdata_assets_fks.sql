-- LOW PRIORITY cleanup (owner-directed, 2026-09-01, credited to the owner catching my own
-- ACCT-F10162 mistake): PR #18928 added mdata_assets_tenant_id_fkey and mdata_assets_unit_id_fkey
-- believing mdata.assets had zero FKs -- an information_schema three-way-join false negative (the
-- exact landmine the owner named the new standing rule after: "FK/constraint claims use
-- pg_constraint, NEVER the information_schema three-way join"). pg_constraint shows the table
-- already carried assets_tenant_id_fkey / assets_unit_id_fkey with the IDENTICAL definitions before
-- #18928 ever ran. Both pairs are semantically redundant (same columns, same target, same behavior)
-- -- drop only the ones #18928 added; the pre-existing, originally-named ones stay untouched.
-- mdata_assets_equipment_id_fkey (also added by #18928) is genuinely new and is explicitly KEPT.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mdata_assets_tenant_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    ALTER TABLE mdata.assets DROP CONSTRAINT mdata_assets_tenant_id_fkey;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mdata_assets_unit_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    ALTER TABLE mdata.assets DROP CONSTRAINT mdata_assets_unit_id_fkey;
  END IF;
END
$$;

-- Sanity: the pre-existing FKs and the new equipment_id FK must all still be present after the drop.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_tenant_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    RAISE EXCEPTION 'assets_tenant_id_fkey missing after cleanup -- mdata.assets would lose tenant FK coverage entirely';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_unit_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    RAISE EXCEPTION 'assets_unit_id_fkey missing after cleanup -- mdata.assets would lose unit FK coverage entirely';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mdata_assets_equipment_id_fkey' AND conrelid = 'mdata.assets'::regclass
  ) THEN
    RAISE EXCEPTION 'mdata_assets_equipment_id_fkey missing -- must be kept, this migration must not touch it';
  END IF;
END
$$;

COMMIT;
