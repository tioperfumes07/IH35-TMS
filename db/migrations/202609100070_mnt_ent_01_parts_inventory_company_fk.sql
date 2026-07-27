-- [HOLD-FOR-JORGE — TIER 1] MNT-ENT-01 — parts_inventory.operating_company_id → org.companies FK.
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: operating_company_id is NOT NULL but soft (RLS-only). Add FK for completeness (isolation
-- already holds via FORCE RLS on prod).
-- Cursor band 20260910xxxx. Idempotent.

BEGIN;

DO $$
DECLARE
  v_dangling bigint;
BEGIN
  IF to_regclass('maintenance.parts_inventory') IS NULL THEN
    RAISE NOTICE 'MNT-ENT-01: maintenance.parts_inventory absent — skip';
    RETURN;
  END IF;
  IF to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'MNT-ENT-01: org.companies absent — skip';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parts_inventory_operating_company_id_fkey'
      AND conrelid = 'maintenance.parts_inventory'::regclass
  ) THEN
    RAISE NOTICE 'MNT-ENT-01: parts_inventory_operating_company_id_fkey already present — skip';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_dangling
  FROM maintenance.parts_inventory p
  WHERE NOT EXISTS (SELECT 1 FROM org.companies c WHERE c.id = p.operating_company_id);

  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'MNT-ENT-01 ABORT: % parts_inventory row(s) with operating_company_id not in org.companies', v_dangling;
  END IF;

  ALTER TABLE maintenance.parts_inventory
    ADD CONSTRAINT parts_inventory_operating_company_id_fkey
    FOREIGN KEY (operating_company_id)
    REFERENCES org.companies(id)
    ON DELETE RESTRICT;
END
$$;

COMMIT;
