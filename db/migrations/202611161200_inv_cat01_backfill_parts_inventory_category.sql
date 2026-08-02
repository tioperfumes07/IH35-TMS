-- INV-CAT-01 — restore maintenance.parts_inventory.category from mis-mapped location tokens.
--
-- ROOT CAUSE: 0292_mnt5_migrate_parts_from_maint.sql copied legacy maint.part.category into
-- maintenance.parts_inventory.location (category column did not exist yet). INV-1 added category
-- but never backfilled. Live prod (2026-08-02, bypass_rls=lucia, mdata.vendors=2827): 144/144
-- category NULL while location holds taxonomy tokens (engine_lubrication, fuel_system, …).
--
-- FIX: move snake_case taxonomy tokens from location → category; clear location so Location/Bin
-- is free for real bin values. Idempotent: only rows with empty category + taxonomy-shaped location.
--
-- Cursor lane HH=12. Pure row DML on maintenance.parts_inventory (non-financial stock metadata).
-- REHEARSED on Neon fork br-dry-silence-akqywit1 (rehearse-inv-cat01-2026-08-02).

BEGIN;

DO $$
BEGIN
  IF to_regclass('maintenance.parts_inventory') IS NULL THEN
    RAISE NOTICE 'INV-CAT-01: maintenance.parts_inventory missing — skip';
    RETURN;
  END IF;

  UPDATE maintenance.parts_inventory
     SET category = location,
         location = NULL,
         updated_at = now()
   WHERE (category IS NULL OR btrim(category) = '')
     AND location IS NOT NULL
     AND btrim(location) <> ''
     AND location ~ '^[a-z][a-z0-9_]*$';
END
$$;

COMMIT;
