-- 202614400000_expenses_tags.sql
-- ROUND 172 step 2 (Lead order, check-engine full QBO Write Check parity). QBO's Write Check screen
-- carries a Tags field; no tag-shaped column exists anywhere in accounting.* (live-verified,
-- information_schema, 2026-09-25). Additive only, default empty array, no backfill, no data change.
--
-- RENAMED TWICE (2026-09-25): originally 202614350000, collided with an already-merged sibling
-- (202614350000_driver_samsara_accounts_map.sql, ROUND 181.1) -- renamed to 202614380000. That slot
-- was then claimed (claim-only, no file yet) by a DIFFERENT concurrent PR (#22798, "mdata.
-- driver_samsara_accounts gains operating_company_id") moments before this push -- renamed again to
-- 202614400000, clear of both collisions, to avoid contesting a slot another seat has already
-- reserved. This file was already live-applied to prod; the live ledger rows
-- (_system._schema_migrations, ih35_migrations.applied_migrations) are updated in the same pass, each
-- time, to keep the on-disk file and the applied-migration record in sync.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'tags'
  ) THEN
    ALTER TABLE accounting.expenses ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
