-- Deactivation consistency for fleet assets (units + equipment/trailers), mirroring the drivers fix
-- (202606161300) and the Sold-units reconcile (202606161600). Closes the Saldana desync class at the DB
-- level so an archived asset can NEVER linger as active again.
--
-- Two parts, idempotent, mdata-only (disjoint from accounting/Path B):
--   (a) RECONCILE existing rows: any archive-status asset missing deactivated_at gets it set now (so it
--       drops from active lists/board/dropdowns, which already filter deactivated_at IS NULL). status is
--       PRESERVED (real disposition kept). The trailer write path historically never set deactivated_at,
--       so prod may hold Sold/Lost trailers still counted active — this fixes them.
--   (b) GUARD with a CHECK: an archive status REQUIRES deactivated_at. The app layer now sets it on every
--       write (units.routes / trailer.routes), and this constraint makes a regression impossible.
--
-- Archive statuses: units = Sold/Transferred/Damaged; equipment = Sold/Lost/Damaged/Transferred.
-- NO retroactive financial disposal entry (same rule as 202606161600 — historical, closed tax years).
-- Reversible: drop the constraints; UPDATE ... SET deactivated_at = NULL WHERE status in (archive).
BEGIN;

-- (a) Reconcile existing desync (re-run matches 0 rows).
UPDATE mdata.units
   SET deactivated_at = now(),
       status_change_reason = COALESCE(status_change_reason, 'Archived unit retired from active fleet (deactivation consistency)')
 WHERE status::text IN ('Sold', 'Transferred', 'Damaged')
   AND deactivated_at IS NULL;

UPDATE mdata.equipment
   SET deactivated_at = now(),
       status_change_reason = COALESCE(status_change_reason, 'Archived equipment retired from active fleet (deactivation consistency)')
 WHERE status::text IN ('Sold', 'Lost', 'Damaged', 'Transferred')
   AND deactivated_at IS NULL;

-- (b) Enforce the invariant going forward (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_units_archive_status_deactivated') THEN
    ALTER TABLE mdata.units
      ADD CONSTRAINT chk_units_archive_status_deactivated
      CHECK (status::text NOT IN ('Sold', 'Transferred', 'Damaged') OR deactivated_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_equipment_archive_status_deactivated') THEN
    ALTER TABLE mdata.equipment
      ADD CONSTRAINT chk_equipment_archive_status_deactivated
      CHECK (status::text NOT IN ('Sold', 'Lost', 'Damaged', 'Transferred') OR deactivated_at IS NOT NULL);
  END IF;
END $$;

COMMIT;
