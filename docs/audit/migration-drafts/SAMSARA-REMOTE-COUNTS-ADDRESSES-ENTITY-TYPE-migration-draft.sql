-- SAMSARA-REMOTE-COUNTS-ADDRESSES-ENTITY-TYPE (ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT,
-- Step 1). READY-TO-APPLY DRAFT, not committed by CC-3 (no-migrations lane).
-- Handoff target: CC-1 (or any authorMigrations:true seat).
--
-- Renumber to the next real migration number before applying (checked live 2026-09-04: confirm
-- the actual next-free number in db/migrations/ at apply time -- do not trust this comment).

-- ============================================================================
-- ROOT CAUSE (verified live, tiny-field-89581227, 2026-09-04): integrations.samsara_remote_counts
-- has CHECK (entity_type = ANY (ARRAY['drivers','vehicles'])). The collector code in this same PR
-- widens SamsaraRemoteEntityType to include "addresses" (ORDER Step 1 -- "Samsara has 100s of
-- previous geofence... nobody asked for addresses"), but the INSERT will hard-fail against this
-- constraint until it is widened too. Additive/safe: existing rows are unaffected, only a new
-- value becomes legal.
-- ============================================================================
ALTER TABLE integrations.samsara_remote_counts DROP CONSTRAINT samsara_remote_counts_entity_type_check;
ALTER TABLE integrations.samsara_remote_counts ADD CONSTRAINT samsara_remote_counts_entity_type_check
  CHECK (entity_type = ANY (ARRAY['drivers'::text, 'vehicles'::text, 'addresses'::text]));
